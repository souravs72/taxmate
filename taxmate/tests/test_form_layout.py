"""Tab layout API — Desk Tab Breaks for the SPA.

Callers: bench run-tests. Exercises taxmate.api.form_layout.get.
Schema: {doctype, tabs:[{id,label,fieldname,fields,is_connections?}], has_connections}.

User: Implement the plan as specified... Don't stop until you have completed all the to-dos.
"""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import form_layout


class TestFormLayout(FrappeTestCase):
	def test_sales_order_has_details_and_connections(self):
		out = form_layout.get("Sales Order")
		ids = [t["id"] for t in out["tabs"]]
		self.assertEqual(ids[0], "__details")
		self.assertTrue(out["has_connections"])
		self.assertTrue(any(t.get("is_connections") for t in out["tabs"]))
		details = out["tabs"][0]
		self.assertTrue(details.get("sections"))
		# Address & Contact / Terms / More Info exist as later tabs
		labels = " ".join(t["label"].lower() for t in out["tabs"])
		self.assertIn("address", labels)
		# Field meta includes labels for rendering
		flat = details["sections"][0]["columns"][0]
		self.assertTrue(flat and flat[0].get("label") and flat[0].get("fieldtype"))
		self.assertIn("reqd", flat[0])

	def test_customer_tabs_include_address(self):
		out = form_layout.get("Customer")
		labels = [t["label"] for t in out["tabs"]]
		joined = " ".join(labels).lower()
		self.assertIn("address", joined)

	def test_customer_mandatory_fields_expose_reqd(self):
		"""SPA Desk controls mark reqd with *; meta must carry the flag."""
		out = form_layout.get("Customer")
		by_name: dict[str, dict] = {}
		for tab in out["tabs"]:
			for sec in tab.get("sections") or []:
				for col in sec.get("columns") or []:
					for field in col:
						by_name[field["fieldname"]] = field
		self.assertEqual(by_name["customer_name"]["reqd"], 1)
		self.assertEqual(by_name["customer_type"]["reqd"], 1)

	def test_payment_entry_without_tab_breaks_still_returns_details(self):
		out = form_layout.get("Payment Entry")
		self.assertEqual(out["tabs"][0]["id"], "__details")
		self.assertTrue(len(out["tabs"][0]["fields"]) > 0)

	def test_sales_invoice_items_table_exposes_list_view_columns(self):
		out = form_layout.get("Sales Invoice")
		items = None
		for tab in out["tabs"]:
			for sec in tab.get("sections") or []:
				for col in sec.get("columns") or []:
					for field in col:
						if field.get("fieldname") == "items":
							items = field
		self.assertIsNotNone(items)
		self.assertEqual(items["fieldtype"], "Table")
		self.assertTrue(items.get("columns"))
		names = [c["fieldname"] for c in items["columns"]]
		self.assertIn("item_code", names)
		self.assertTrue(all(c.get("label") and c.get("fieldtype") for c in items["columns"]))

	def test_customer_fields_carry_depends_on_key(self):
		out = form_layout.get("Customer")
		by_name: dict[str, dict] = {}
		for tab in out["tabs"]:
			for sec in tab.get("sections") or []:
				for col in sec.get("columns") or []:
					for field in col:
						by_name[field["fieldname"]] = field
		self.assertIn("depends_on", by_name["customer_name"])
		self.assertTrue(any(f.get("depends_on") for f in by_name.values()))

	def test_refused_outside_catalog(self):
		with self.assertRaises(frappe.PermissionError):
			form_layout.get("DocType")

	def test_read_permission_required(self):
		with patch("frappe.has_permission", return_value=False) as hp:
			with self.assertRaises(frappe.PermissionError):
				form_layout.get("Customer")
			hp.assert_any_call("Customer", "read")

	def test_virtual_fields_flagged(self):
		out = form_layout.get("Sales Invoice")
		by_name: dict[str, dict] = {}
		for tab in out["tabs"]:
			for sec in tab.get("sections") or []:
				for col in sec.get("columns") or []:
					for field in col:
						by_name[field["fieldname"]] = field
		meta = frappe.get_meta("Sales Invoice")
		self.assertTrue(
			any(getattr(df, "is_virtual", 0) and not getattr(df, "hidden", 0) for df in meta.fields),
			"Sales Invoice should have a visible virtual field to flag",
		)
		for df in meta.fields:
			if not getattr(df, "is_virtual", 0) or getattr(df, "hidden", 0):
				continue
			if not df.fieldname or df.fieldtype in (
				"Tab Break",
				"Section Break",
				"Column Break",
				"Fold",
				"Heading",
				"HTML",
				"Button",
				"Image",
			):
				continue
			self.assertIn(df.fieldname, by_name)
			self.assertEqual(by_name[df.fieldname].get("is_virtual"), 1)
