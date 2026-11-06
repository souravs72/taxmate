"""TaxMate Workflow API — Management, Approval Rules, and Lifecycle Execution."""

from __future__ import annotations

from typing import Any
import frappe
from frappe import _
from frappe.client import cancel as client_cancel
from frappe.utils import cint

from taxmate.api.resource import _require_doc, assert_allowed_doctype, require_login
from taxmate.setup.spa_roles import STANDARD_ROLE_FOR_SPA, spa_role_of
from taxmate.utils.company import get_default_company
from taxmate.workflow.company_workflow import get_workflow_name


def _require_login() -> None:
	if not frappe.session.user or frappe.session.user == "Guest":
		frappe.throw(_("Please sign in to access workflows"), frappe.PermissionError)


def _holds_standard_role(spa: str | None) -> bool:
	"""Frontend role counts only when its standard Frappe role is on the user."""
	if frappe.session.user == "Administrator":
		return True
	roles = set(frappe.get_roles())
	if "System Manager" in roles:
		return True
	required = STANDARD_ROLE_FOR_SPA.get(spa or "")
	if not required:
		return False
	return required in roles


def _assert_can_submit() -> None:
	spa = spa_role_of()
	if spa == "viewer" or not _holds_standard_role(spa):
		frappe.throw(_("Viewers cannot submit"), frappe.PermissionError)


def _assert_can_cancel() -> None:
	spa = spa_role_of()
	if spa not in ("owner", "accountant") or not _holds_standard_role(spa):
		frappe.throw(_("Only an Owner or Accountant can cancel"), frappe.PermissionError)


@frappe.whitelist(methods=["POST", "PUT"])
def submit(doc):
	"""Submit by name. Reloads so clients need not send `modified`."""
	require_login()
	_assert_can_submit()
	doc = _require_doc(doc)
	name = doc.get("name")
	if not name:
		frappe.throw(_("name is required"))
	loaded = frappe.get_doc(doc["doctype"], name)
	loaded.check_permission("submit")
	loaded.submit()
	return loaded.as_dict()


@frappe.whitelist(methods=["POST", "PUT"])
def cancel(doctype, name):
	require_login()
	_assert_can_cancel()
	assert_allowed_doctype(doctype)
	return client_cancel(doctype, name)


@frappe.whitelist(methods=["POST"])
def amend(doctype: str, name: str):
	require_login()
	_assert_can_cancel()
	assert_allowed_doctype(doctype)
	source = frappe.get_doc(doctype, name)
	source.check_permission("amend")
	if source.docstatus != 2:
		frappe.throw(_("Only cancelled documents can be amended"))

	new_doc = frappe.copy_doc(source, ignore_no_copy=False)
	new_doc.docstatus = 0
	new_doc.amended_from = source.name
	new_doc.insert()
	return new_doc.as_dict()


# --- Multi-Entity Approval Workflow APIs ---


@frappe.whitelist()
def get_workflows(company: str | None = None) -> list[dict[str, Any]]:
	"""Return workflows available to the company (both entity-scoped and global)."""
	_require_login()
	active_company = company or get_default_company()

	has_company_col = frappe.db.has_column("Workflow", "company")
	filters: dict[str, Any] = {}
	fields = [
		"name",
		"workflow_name",
		"document_type",
		"is_active",
		"workflow_state_field",
		"modified",
	]
	if has_company_col:
		fields.append("company")
		if active_company:
			filters = {"company": ["in", [active_company, "", None]]}

	workflows = frappe.get_all(
		"Workflow",
		filters=filters,
		fields=fields,
		order_by="modified desc",
	)

	out = []
	for wf in workflows:
		states_count = frappe.db.count("Workflow Document State", {"parent": wf.name})
		transitions_count = frappe.db.count("Workflow Transition", {"parent": wf.name})
		wf_company = wf.get("company") if has_company_col else None
		out.append(
			{
				"name": wf.name,
				"workflow_name": wf.workflow_name or wf.name,
				"document_type": wf.document_type,
				"is_active": cint(wf.is_active),
				"company": wf_company or None,
				"is_entity_specific": bool(wf_company),
				"states_count": states_count,
				"transitions_count": transitions_count,
				"modified": str(wf.modified),
			}
		)

	return out


@frappe.whitelist()
def get_workflow(name: str) -> dict[str, Any]:
	"""Return the full details, states, and transitions of a Workflow."""
	_require_login()
	if not frappe.db.exists("Workflow", name):
		frappe.throw(_("Workflow {0} not found").format(name))

	doc = frappe.get_doc("Workflow", name)

	states = []
	for s in doc.states:
		states.append(
			{
				"state": s.state,
				"doc_status": s.doc_status,
				"allow_edit": s.allow_edit,
				"is_optional_state": s.is_optional_state,
				"next_action_email_template": s.next_action_email_template,
			}
		)

	transitions = []
	for t in doc.transitions:
		transitions.append(
			{
				"state": t.state,
				"action": t.action,
				"next_state": t.next_state,
				"allowed": t.allowed,
				"allow_self_approval": cint(t.allow_self_approval),
				"condition": t.condition,
			}
		)

	return {
		"name": doc.name,
		"workflow_name": doc.workflow_name or doc.name,
		"document_type": doc.document_type,
		"is_active": cint(doc.is_active),
		"workflow_state_field": doc.workflow_state_field or "workflow_state",
		"company": doc.get("company") or None,
		"send_email_alert": cint(doc.send_email_alert),
		"override_status": cint(doc.get("override_status")),
		"enable_action_confirmation": cint(doc.get("enable_action_confirmation")),
		"states": states,
		"transitions": transitions,
	}


@frappe.whitelist()
def get_document_transitions(doctype: str, name: str) -> list[dict[str, Any]]:
	"""Return available workflow transitions for a document in the active user context."""
	_require_login()
	if not frappe.db.exists(doctype, name):
		return []

	doc = frappe.get_doc(doctype, name)
	from frappe.model.workflow import get_transitions

	transitions = get_transitions(doc) or []
	user = frappe.session.user
	user_roles = set(frappe.get_roles(user))

	out = []
	for t in transitions:
		# Check role permission
		if t.allowed in user_roles or user == "Administrator":
			# Check self approval
			if user == "Administrator" or cint(t.allow_self_approval) or user != doc.owner:
				out.append(
					{
						"action": t.action,
						"next_state": t.next_state,
						"allowed": t.allowed,
					}
				)

	return out


@frappe.whitelist(methods=["POST"])
def apply_document_workflow(doctype: str, name: str, action: str) -> dict[str, Any]:
	"""Apply a workflow action to advance the document state."""
	_require_login()
	doc = frappe.get_doc(doctype, name)
	from frappe.model.workflow import apply_workflow

	updated = apply_workflow(doc, action)
	frappe.db.commit()
	return updated.as_dict()


@frappe.whitelist(methods=["POST"])
def toggle_active(name: str, is_active: int) -> dict[str, Any]:
	"""Toggle the is_active status of a workflow."""
	_require_login()
	doc = frappe.get_doc("Workflow", name)
	doc.is_active = cint(is_active)
	doc.save()
	frappe.db.commit()
	return {"name": doc.name, "is_active": doc.is_active}


def ensure_workflow_state(state_name: str) -> None:
	"""Idempotently ensure a Workflow State master document exists."""
	if not frappe.db.exists("Workflow State", state_name):
		frappe.get_doc({
			"doctype": "Workflow State",
			"workflow_state_name": state_name,
		}).insert(ignore_permissions=True, ignore_if_duplicate=True)


def ensure_workflow_action(action_name: str) -> None:
	"""Idempotently ensure a Workflow Action Master document exists."""
	if not frappe.db.exists("Workflow Action Master", action_name):
		frappe.get_doc({
			"doctype": "Workflow Action Master",
			"workflow_action_name": action_name,
		}).insert(ignore_permissions=True, ignore_if_duplicate=True)


@frappe.whitelist(methods=["POST"])
def create_template_workflow(template_key: str, company: str | None = None) -> dict[str, Any]:
	"""Quickly scaffold a high-value approval workflow template for an entity."""
	_require_login()
	active_company = company or get_default_company()
	if not active_company:
		frappe.throw(_("Active company required to scaffold workflow"))

	abbr = frappe.db.get_value("Company", active_company, "abbr") or "TM"

	if template_key == "sales_invoice_two_tier":
		wf_name = f"{abbr} - Sales Invoice Tiered Approval"
		if frappe.db.exists("Workflow", wf_name):
			return {"name": wf_name, "message": "Workflow already exists"}

		states = [
			{"state": "Draft", "doc_status": "0", "allow_edit": "Accounts User"},
			{"state": "Pending Manager Approval", "doc_status": "0", "allow_edit": "Accounts Manager"},
			{"state": "Pending Director Approval", "doc_status": "0", "allow_edit": "Accounts Manager"},
			{"state": "Approved", "doc_status": "1", "allow_edit": "Accounts Manager"},
			{"state": "Rejected", "doc_status": "0", "allow_edit": "Accounts Manager"},
		]
		transitions = [
			{"state": "Draft", "action": "Submit for Review", "next_state": "Pending Manager Approval", "allowed": "Accounts User"},
			{"state": "Pending Manager Approval", "action": "Approve", "next_state": "Approved", "allowed": "Accounts Manager", "condition": "doc.grand_total <= 50000"},
			{"state": "Pending Manager Approval", "action": "Escalate to Director", "next_state": "Pending Director Approval", "allowed": "Accounts Manager", "condition": "doc.grand_total > 50000"},
			{"state": "Pending Manager Approval", "action": "Reject", "next_state": "Rejected", "allowed": "Accounts Manager"},
			{"state": "Pending Director Approval", "action": "Approve", "next_state": "Approved", "allowed": "Accounts Manager"},
			{"state": "Pending Director Approval", "action": "Reject", "next_state": "Rejected", "allowed": "Accounts Manager"},
			{"state": "Rejected", "action": "Reopen Draft", "next_state": "Draft", "allowed": "Accounts User"},
		]

		for s in states:
			ensure_workflow_state(s["state"])
		for t in transitions:
			ensure_workflow_action(t["action"])

		doc = frappe.get_doc(
			{
				"doctype": "Workflow",
				"workflow_name": wf_name,
				"document_type": "Sales Invoice",
				"workflow_state_field": "workflow_state",
				"company": active_company,
				"is_active": 1,
				"send_email_alert": 0,
				"states": states,
				"transitions": transitions,
			}
		)
		doc.insert()
		frappe.db.commit()
		return {"name": doc.name, "created": True}

	elif template_key == "purchase_order_approval":
		wf_name = f"{abbr} - Purchase Order Authorization"
		if frappe.db.exists("Workflow", wf_name):
			return {"name": wf_name, "message": "Workflow already exists"}

		states = [
			{"state": "Draft", "doc_status": "0", "allow_edit": "Accounts User"},
			{"state": "Pending PO Approval", "doc_status": "0", "allow_edit": "Accounts Manager"},
			{"state": "Authorized", "doc_status": "1", "allow_edit": "Accounts Manager"},
			{"state": "Declined", "doc_status": "0", "allow_edit": "Accounts Manager"},
		]
		transitions = [
			{"state": "Draft", "action": "Send for PO Authorization", "next_state": "Pending PO Approval", "allowed": "Accounts User"},
			{"state": "Pending PO Approval", "action": "Authorize", "next_state": "Authorized", "allowed": "Accounts Manager"},
			{"state": "Pending PO Approval", "action": "Decline", "next_state": "Declined", "allowed": "Accounts Manager"},
			{"state": "Declined", "action": "Revise Order", "next_state": "Draft", "allowed": "Accounts User"},
		]

		for s in states:
			ensure_workflow_state(s["state"])
		for t in transitions:
			ensure_workflow_action(t["action"])

		doc = frappe.get_doc(
			{
				"doctype": "Workflow",
				"workflow_name": wf_name,
				"document_type": "Purchase Order",
				"workflow_state_field": "workflow_state",
				"company": active_company,
				"is_active": 1,
				"send_email_alert": 0,
				"states": states,
				"transitions": transitions,
			}
		)
		doc.insert()
		frappe.db.commit()
		return {"name": doc.name, "created": True}

	frappe.throw(_("Unknown template key: {0}").format(template_key))


@frappe.whitelist(methods=["POST"])
def create_custom_workflow(
	workflow_name: str,
	document_type: str,
	company: str | None = None,
	workflow_state_field: str = "workflow_state",
) -> dict[str, Any]:
	"""Create a new custom workflow for an entity with standard approval lifecycle states."""
	_require_login()
	active_company = company or get_default_company()
	if not active_company:
		frappe.throw(_("Active company required to create workflow"))

	if frappe.db.exists("Workflow", workflow_name):
		frappe.throw(_("Workflow '{0}' already exists").format(workflow_name))

	ensure_workflow_state("Draft")
	ensure_workflow_state("Pending Approval")
	ensure_workflow_state("Approved")
	ensure_workflow_state("Rejected")
	ensure_workflow_action("Submit for Approval")
	ensure_workflow_action("Approve")
	ensure_workflow_action("Reject")
	ensure_workflow_action("Reopen Draft")

	doc = frappe.get_doc(
		{
			"doctype": "Workflow",
			"workflow_name": workflow_name,
			"document_type": document_type,
			"workflow_state_field": workflow_state_field or "workflow_state",
			"company": active_company,
			"is_active": 1,
			"send_email_alert": 0,
			"states": [
				{"state": "Draft", "doc_status": "0", "allow_edit": "Accounts User"},
				{"state": "Pending Approval", "doc_status": "0", "allow_edit": "Accounts Manager"},
				{"state": "Approved", "doc_status": "1", "allow_edit": "Accounts Manager"},
				{"state": "Rejected", "doc_status": "0", "allow_edit": "Accounts Manager"},
			],
			"transitions": [
				{"state": "Draft", "action": "Submit for Approval", "next_state": "Pending Approval", "allowed": "Accounts User"},
				{"state": "Pending Approval", "action": "Approve", "next_state": "Approved", "allowed": "Accounts Manager"},
				{"state": "Pending Approval", "action": "Reject", "next_state": "Rejected", "allowed": "Accounts Manager"},
				{"state": "Rejected", "action": "Reopen Draft", "next_state": "Draft", "allowed": "Accounts User"},
			],
		}
	)
	doc.insert()
	frappe.db.commit()
	return {"name": doc.name, "created": True}
