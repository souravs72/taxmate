"""TaxMate Multi-Company Workflow Controller and Resolution Engine.

Standard Frappe Workflow does not scope workflows to Company:
1. tabWorkflow has no company Link field by default.
2. Workflow.set_active deactivates all other workflows for that DocType globally across all companies.
3. frappe.model.workflow.get_workflow_name only filters by document_type and is_active=1.

TaxMate provides multi-entity workflow isolation:
1. Workflow has a `company` Link field (taxmate/uae_vat/constants/custom_fields.py).
2. On before_insert: auto-populates `doc.company` from the active user company if empty.
3. On validate: scopes `set_active` to (document_type, company) so Entity A's workflows
   never deactivate Entity B's workflows.
4. Overrides get_workflow_name and Meta.get_workflow to resolve:
   Active Workflow for (DocType, Company) -> Active Global Workflow -> None.
"""

from __future__ import annotations

from typing import Any
import frappe
from frappe import _
from frappe.utils import cint

from taxmate.utils.company import get_default_company


def before_insert(doc: Any, method: str | None = None) -> None:
	"""Auto-populate company from the active session if not explicitly provided and not global."""
	if doc.flags.get("is_global"):
		doc.company = None
		return
	if not doc.get("company"):
		active = get_default_company()
		if active:
			doc.company = active


def validate(doc: Any, method: str | None = None) -> None:
	"""Scope active workflow uniqueness to (document_type, company)."""
	if not frappe.db.has_column("Workflow", "company"):
		return

	if not doc.flags.get("is_global") and not doc.get("company"):
		active = get_default_company()
		if active:
			doc.company = active

	if cint(doc.is_active):
		if doc.get("company"):
			# Deactivate other workflows for the SAME company and doctype
			frappe.db.sql(
				"""
				UPDATE `tabWorkflow`
				SET `is_active` = 0
				WHERE `document_type` = %s AND `company` = %s AND `name` != %s
				""",
				(doc.document_type, doc.company, doc.name),
			)
		else:
			# Deactivate other global (null company) workflows for this doctype
			frappe.db.sql(
				"""
				UPDATE `tabWorkflow`
				SET `is_active` = 0
				WHERE `document_type` = %s AND ifnull(`company`, '') = '' AND `name` != %s
				""",
				(doc.document_type, doc.name),
			)


def get_workflow_name(doctype: str, company: str | None = None) -> str | None:
	"""Resolve the active workflow for a DocType within an entity.

	Resolution priority:
	1. Company-specific active workflow: (doctype, company, is_active=1)
	2. Global fallback active workflow: (doctype, company is null/empty, is_active=1)
	"""
	if not frappe.db.has_column("Workflow", "company"):
		return frappe.db.get_value("Workflow", {"document_type": doctype, "is_active": 1}, "name")

	if not company:
		company = get_default_company()

	if company:
		# 1. Company-specific active workflow
		wf_name = frappe.db.get_value(
			"Workflow",
			{"document_type": doctype, "company": company, "is_active": 1},
			"name",
		)
		if wf_name:
			return wf_name

	# 2. Global fallback
	return frappe.db.get_value(
		"Workflow",
		{"document_type": doctype, "is_active": 1, "company": ["in", ["", None]]},
		"name",
	)


# ── Monkey-Patching Frappe Core Workflow Resolution ────────────────────────

_ORIGINAL_GET_WORKFLOW_NAME = None
_ORIGINAL_META_GET_WORKFLOW = None


def install_workflow_patch() -> None:
	"""Patch Frappe workflow functions so standard document operations use company workflows."""
	global _ORIGINAL_GET_WORKFLOW_NAME, _ORIGINAL_META_GET_WORKFLOW

	import frappe.model.workflow
	import frappe.model.meta

	if _ORIGINAL_GET_WORKFLOW_NAME is None:
		_ORIGINAL_GET_WORKFLOW_NAME = frappe.model.workflow.get_workflow_name

		def patched_get_workflow_name(doctype: str) -> str | None:
			# If the caller has a current document with a company field, use it
			company = None
			if hasattr(frappe.local, "workflow_doc_company") and frappe.local.workflow_doc_company:
				company = frappe.local.workflow_doc_company
			elif hasattr(frappe.local, "form_dict") and frappe.local.form_dict.get("company"):
				company = frappe.local.form_dict.get("company")
			return get_workflow_name(doctype, company=company)

		frappe.model.workflow.get_workflow_name = patched_get_workflow_name

	if _ORIGINAL_META_GET_WORKFLOW is None:
		_ORIGINAL_META_GET_WORKFLOW = frappe.model.meta.Meta.get_workflow

		def patched_meta_get_workflow(self) -> str | None:
			company = None
			if hasattr(frappe.local, "workflow_doc_company") and frappe.local.workflow_doc_company:
				company = frappe.local.workflow_doc_company
			return get_workflow_name(self.name, company=company)

		frappe.model.meta.Meta.get_workflow = patched_meta_get_workflow

	# Also patch Workflow.set_active so company workflows don't deactivate each other
	from frappe.workflow.doctype.workflow.workflow import Workflow

	def patched_set_active(self):
		if cint(self.is_active):
			if not frappe.db.has_column("Workflow", "company") or not self.get("company"):
				frappe.db.sql(
					"""UPDATE `tabWorkflow` SET `is_active`=0
					WHERE `document_type`=%s AND ifnull(`company`, '') = '' AND `name`!=%s""",
					(self.document_type, self.name),
				)
			else:
				frappe.db.sql(
					"""UPDATE `tabWorkflow` SET `is_active`=0
					WHERE `document_type`=%s AND `company`=%s AND `name`!=%s""",
					(self.document_type, self.company, self.name),
				)

	Workflow.set_active = patched_set_active
