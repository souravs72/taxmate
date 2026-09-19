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

	def test_list_customer_hit(self):
		out = awesome(text="customer", limit=10)
		lists = next((g for g in out["groups"] if g["results"] and g["results"][0].get("type") == "list"), None)
		self.assertIsNotNone(lists)
		routes = {r["route"] for r in lists["results"]}
		self.assertIn("/customers", routes)

	def test_no_desk_routes(self):
		out = awesome(text="customer", limit=20)
		for group in out["groups"]:
			for row in group["results"]:
				self.assertFalse(cstr(row.get("route")).startswith("/app/"), row)
