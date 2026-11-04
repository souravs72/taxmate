"""Tab layout API — Desk Tab Breaks for the SPA.

Callers: bench run-tests. Exercises taxmate.api.form_layout.get.
Schema: {doctype, tabs:[{id,label,fieldname,fields,is_connections?}], has_connections}.

User: Implement the plan as specified... Don't stop until you have completed all the to-dos.
"""

from __future__ import annotations

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

	def test_customer_tabs_include_address(self):
		out = form_layout.get("Customer")
		labels = [t["label"] for t in out["tabs"]]
		joined = " ".join(labels).lower()
		self.assertIn("address", joined)

	def test_payment_entry_without_tab_breaks_still_returns_details(self):
		out = form_layout.get("Payment Entry")
		self.assertEqual(out["tabs"][0]["id"], "__details")
		self.assertTrue(len(out["tabs"][0]["fields"]) > 0)

	def test_refused_outside_catalog(self):
		with self.assertRaises(frappe.PermissionError):
			form_layout.get("DocType")
