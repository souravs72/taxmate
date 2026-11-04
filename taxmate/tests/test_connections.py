"""Connections open_count API for the SPA.

Callers: bench run-tests only. Module under test: taxmate.api.connections.open_count.
Also checks spa_list_path from taxmate.api.spa_routes.
Response: groups/items with doctype, count, open_count, spa_path, fieldname.

User instruction: Implement the plan as specified, it is attached for your
reference. Do NOT edit the plan file itself. ... Don't stop until you have
completed all the to-dos.
"""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import connections
from taxmate.api.spa_routes import spa_list_path


class TestConnections(FrappeTestCase):
	def test_spa_list_path_strips_name(self):
		self.assertEqual(spa_list_path("Sales Order"), "/orders")
		self.assertIsNone(spa_list_path("No Such DocType"))

	def test_sales_order_groups_include_fulfillment_doctypes(self):
		name = frappe.db.get_value("Sales Order", {}, "name")
		if not name:
			self.skipTest("no Sales Order on this site")
		out = connections.open_count("Sales Order", name)
		self.assertTrue(out["groups"])
		doctypes = {i["doctype"] for g in out["groups"] for i in g["items"]}
		self.assertIn("Delivery Note", doctypes)
		self.assertIn("Sales Invoice", doctypes)
		dn = next(i for g in out["groups"] for i in g["items"] if i["doctype"] == "Delivery Note")
		self.assertEqual(dn["spa_path"], "/delivery-notes")

	def test_missing_doc_raises(self):
		with self.assertRaises(frappe.DoesNotExistError):
			connections.open_count("Sales Order", "NO-SUCH-SO-999")
