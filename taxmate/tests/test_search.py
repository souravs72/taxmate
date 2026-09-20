"""TaxMate AwesomeBar allowlist + SPA awesome search API.

Importers/callers: unittest via bench run-tests; taxmate.api.search.awesome
(whitelist) called by frontend GlobalSearch via METHOD.awesomeSearch.
Schema: awesome(text, limit) → {query, groups:[{title, results:[{type,route,...}]}]}.
User: "SeaRCH ANYTHING BAR in the frontend should work like the awesomebar."

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_search
"""

from __future__ import annotations

import unittest

from frappe.tests.utils import FrappeTestCase
from frappe.utils import cstr

from taxmate.api.search import awesome
from taxmate.search import ALLOWED_SEARCH_DOCTYPES, ALLOWED_SEARCH_MODULES


class TestSearchAllowlist(unittest.TestCase):
	def test_operator_and_idp_doctypes_are_allowed(self):
		for name in (
			"User",
			"Role",
			"User Permission",
			"System Settings",
			"Print Settings",
			"Data Import",
			"IDP Conversation",
			"IDP Settings",
		):
			self.assertIn(name, ALLOWED_SEARCH_DOCTYPES, name)

	def test_idp_module_is_allowed(self):
		self.assertIn("IDP", ALLOWED_SEARCH_MODULES)


class TestAwesomeSearch(FrappeTestCase):
	def test_empty_query_returns_no_groups(self):
		out = awesome(text="", limit=10)
		self.assertEqual(out["groups"], [])

	def test_nav_pages_match_orders(self):
		out = awesome(text="order", limit=10)
		pages = next((g for g in out["groups"] if g["results"] and g["results"][0].get("type") == "page"), None)
		self.assertIsNotNone(pages)
		self.assertTrue(any(r["route"] == "/orders" for r in pages["results"]))

	def test_nav_pages_match_dashboard(self):
		out = awesome(text="dashboard", limit=10)
		pages = next((g for g in out["groups"] if g["results"] and g["results"][0].get("type") == "page"), None)
		self.assertIsNotNone(pages)
		self.assertTrue(any(r["route"] == "/" for r in pages["results"]))

	def test_delivery_note_spa_routes(self):
		out = awesome(text="delivery", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/delivery-notes" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_list_customer_hit(self):
		out = awesome(text="customer", limit=10)
		lists = next((g for g in out["groups"] if g["results"] and g["results"][0].get("type") == "list"), None)
		self.assertIsNotNone(lists)
		routes = {r["route"] for r in lists["results"]}
		self.assertIn("/customers", routes)

	def test_list_supplier_hit(self):
		out = awesome(text="supplier", limit=10)
		lists = next((g for g in out["groups"] if g["results"] and g["results"][0].get("type") == "list"), None)
		self.assertIsNotNone(lists)
		routes = {r["route"] for r in lists["results"]}
		self.assertIn("/suppliers", routes)
		self.assertFalse(any(cstr(r.get("route")).startswith("/app/") for r in lists["results"]))

	def test_purchase_invoice_spa_routes(self):
		out = awesome(text="purchase invoice", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/purchase-invoices" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_purchase_order_spa_routes(self):
		out = awesome(text="purchase order", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/purchase-orders" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_purchase_receipt_spa_routes(self):
		out = awesome(text="purchase receipt", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/purchase-receipts" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_warehouse_spa_routes(self):
		out = awesome(text="warehouse", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/warehouses" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_tax_template_spa_routes(self):
		out = awesome(text="tax template", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/tax-templates" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_vat_201_spa_routes(self):
		out = awesome(text="vat 201", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/vat-201" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_ct_esr_ubo_late_spa_routes(self):
		for query, route in (
			("corporate tax", "/ct-filings"),
			("esr", "/esr"),
			("ubo", "/ubo"),
			("late filing", "/late-filings"),
		):
			out = awesome(text=query, limit=20)
			routes = [row["route"] for group in out["groups"] for row in group["results"]]
			self.assertTrue(any(r == route for r in routes), query)
			self.assertFalse(any(cstr(r).startswith("/app/") for r in routes), query)

	def test_reports_spa_routes(self):
		out = awesome(text="trial balance", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/reports" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_chart_of_accounts_spa_routes(self):
		out = awesome(text="chart of accounts", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/accounts" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_journal_entry_spa_routes(self):
		out = awesome(text="journal", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/journals" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_incoming_invoice_spa_routes(self):
		out = awesome(text="incoming", limit=20)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/incoming-invoices" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_payables_spa_routes(self):
		out = awesome(text="payable", limit=10)
		routes = [row["route"] for group in out["groups"] for row in group["results"]]
		self.assertTrue(any(route == "/payables" for route in routes))
		self.assertFalse(any(cstr(route).startswith("/app/") for route in routes))

	def test_no_desk_routes(self):
		out = awesome(text="customer", limit=20)
		for group in out["groups"]:
			for row in group["results"]:
				self.assertFalse(cstr(row.get("route")).startswith("/app/"), row)
