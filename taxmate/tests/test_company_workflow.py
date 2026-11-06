"""Tests for Multi-Company Scoped Workflows in TaxMate."""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.workflow.company_workflow import get_workflow_name
from taxmate.api.workflow import (
	get_workflows,
	get_workflow,
	toggle_active,
	create_template_workflow,
	ensure_workflow_state,
	ensure_workflow_action,
)


class TestCompanyWorkflow(FrappeTestCase):
	def setUp(self):
		super().setUp()
		# Clear any test workflows
		frappe.db.delete("Workflow", {"name": ["like", "TEST-%"]})
		frappe.db.commit()

	def tearDown(self):
		frappe.db.delete("Workflow", {"name": ["like", "TEST-%"]})
		frappe.db.commit()
		super().tearDown()

	def test_company_field_in_workflow_doctype(self):
		"""Ensure Workflow DocType has the company link field."""
		frappe.clear_cache(doctype="Workflow")
		meta = frappe.get_meta("Workflow")
		self.assertTrue(meta.has_field("company"), "Workflow DocType should have 'company' field")
		field = meta.get_field("company")
		self.assertEqual(field.options, "Company")

	def test_workflow_entity_resolution_and_fallback(self):
		"""Test entity-scoped workflow takes precedence over global workflow."""
		ensure_workflow_state("Draft")
		ensure_workflow_state("Pending Manager")
		ensure_workflow_state("Approved")
		ensure_workflow_action("Submit")
		ensure_workflow_action("Approve")

		# 1. Create a global workflow for Quotation
		global_wf = frappe.get_doc(
			{
				"doctype": "Workflow",
				"workflow_name": "TEST-Global-Quotation",
				"document_type": "Quotation",
				"is_active": 1,
				"workflow_state_field": "workflow_state",
				"company": None,
				"states": [
					{"state": "Draft", "doc_status": "0", "allow_edit": "Accounts User"},
					{"state": "Approved", "doc_status": "1", "allow_edit": "Accounts Manager"},
				],
				"transitions": [
					{"state": "Draft", "action": "Approve", "next_state": "Approved", "allowed": "Accounts Manager"},
				],
			}
		)
		global_wf.flags.is_global = 1
		global_wf.insert(ignore_permissions=True)

		# 2. When querying for Quotation, resolves to global_wf
		wf_resolved = get_workflow_name("Quotation", company="Non Existent Co")
		self.assertEqual(wf_resolved, global_wf.name)

		# 3. Create company-specific workflow for Al Madina
		al_madina = "Al Madina Hypermarket LLC"
		if not frappe.db.exists("Company", al_madina):
			company_doc = frappe.get_doc({
				"doctype": "Company",
				"company_name": al_madina,
				"abbr": "AMH",
				"default_currency": "AED",
				"country": "United Arab Emirates",
			}).insert(ignore_permissions=True)

		scoped_wf = frappe.get_doc(
			{
				"doctype": "Workflow",
				"workflow_name": "TEST-Madina-Quotation",
				"document_type": "Quotation",
				"is_active": 1,
				"workflow_state_field": "workflow_state",
				"company": al_madina,
				"states": [
					{"state": "Draft", "doc_status": "0", "allow_edit": "Accounts User"},
					{"state": "Pending Manager", "doc_status": "0", "allow_edit": "Accounts Manager"},
					{"state": "Approved", "doc_status": "1", "allow_edit": "Accounts Manager"},
				],
				"transitions": [
					{"state": "Draft", "action": "Submit", "next_state": "Pending Manager", "allowed": "Accounts User"},
					{"state": "Pending Manager", "action": "Approve", "next_state": "Approved", "allowed": "Accounts Manager"},
				],
			}
		).insert(ignore_permissions=True)

		# 4. When document belongs to Al Madina, returns scoped_wf
		wf_madina = get_workflow_name("Quotation", company=al_madina)
		self.assertEqual(wf_madina, scoped_wf.name)

		# 5. When document belongs to another company without scoped workflow, falls back to global
		wf_other = get_workflow_name("Quotation", company="Other Random LLC")
		self.assertEqual(wf_other, global_wf.name)

	def test_workflow_api_listing_and_detail(self):
		"""Test API listing filtering by active company."""
		frappe.set_user("Administrator")
		workflows = get_workflows(company="Al Madina Hypermarket LLC")
		self.assertIsInstance(workflows, list)

		# Test template scaffolding
		res = create_template_workflow("sales_invoice_two_tier", company="Al Madina Hypermarket LLC")
		self.assertIn("name", res)

		# Test get_workflow detail
		wf_detail = get_workflow(res["name"])
		self.assertEqual(wf_detail["document_type"], "Sales Invoice")
		self.assertEqual(wf_detail["company"], "Al Madina Hypermarket LLC")
		self.assertGreaterEqual(len(wf_detail["states"]), 3)
		self.assertGreaterEqual(len(wf_detail["transitions"]), 2)

		# Test toggle active
		toggled = toggle_active(res["name"], is_active=0)
		self.assertEqual(toggled["is_active"], 0)
		toggled_back = toggle_active(res["name"], is_active=1)
		self.assertEqual(toggled_back["is_active"], 1)
