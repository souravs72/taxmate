"""Header company switcher: active company, persistence, list scoping.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_company_switcher
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import resource
from taxmate.api.resource import _names_company, scope_to_active_company
from taxmate.utils import company as company_utils


class TestScopeFilters(unittest.TestCase):
	"""Filter shapes, with the doctype check and active company stubbed."""

	def setUp(self):
		self._p1 = patch.object(resource, "company_scoped", lambda dt: dt == "Sales Invoice")
		self._p2 = patch.object(resource, "get_default_company", lambda: "Olive Grove Kitchen LLC")
		self._p3 = patch.object(resource, "can_use_company", lambda company, user=None: True)
		self._p1.start()
		self._p2.start()
		self._p3.start()

	def tearDown(self):
		self._p3.stop()
		self._p1.stop()
		self._p2.stop()

	def test_no_filters_gets_company(self):
		self.assertEqual(
			scope_to_active_company("Sales Invoice", None),
			[["company", "=", "Olive Grove Kitchen LLC"]],
		)

	def test_list_filters_appended(self):
		out = scope_to_active_company("Sales Invoice", '[["docstatus","=",1]]')
		self.assertEqual(out, [["docstatus", "=", 1], ["company", "=", "Olive Grove Kitchen LLC"]])

	def test_dict_filters_appended(self):
		out = scope_to_active_company("Sales Invoice", {"docstatus": 1})
		self.assertEqual(out, {"docstatus": 1, "company": "Olive Grove Kitchen LLC"})

	def test_explicit_company_kept(self):
		self.assertEqual(
			scope_to_active_company("Sales Invoice", [["company", "=", "B"]]),
			[["company", "=", "B"]],
		)
		self.assertEqual(
			scope_to_active_company("Sales Invoice", [["Sales Invoice", "company", "=", "B"]]),
			[["Sales Invoice", "company", "=", "B"]],
		)
		self.assertEqual(scope_to_active_company("Sales Invoice", {"company": "B"}), {"company": "B"})

	def test_explicit_company_rejected(self):
		with patch.object(resource, "can_use_company", lambda company, user=None: False):
			with self.assertRaises(frappe.PermissionError):
				scope_to_active_company("Sales Invoice", [["company", "=", "B"]])
			with self.assertRaises(frappe.PermissionError):
				scope_to_active_company("Sales Invoice", None, [["company", "in", ["B"]]])

	def test_company_in_or_filters_kept(self):
		self.assertIsNone(scope_to_active_company("Sales Invoice", None, [["company", "=", "B"]]))

	def test_unscoped_doctype_untouched(self):
		self.assertEqual(scope_to_active_company("Customer", '[["disabled","=",0]]'), '[["disabled","=",0]]')

	def test_names_company(self):
		self.assertTrue(_names_company(["company", "=", "X"]))
		self.assertTrue(_names_company(["Sales Invoice", "company", "in", ["X"]]))
		self.assertFalse(_names_company(["customer", "=", "company"]))
		self.assertFalse(_names_company("company"))


class TestCompanyScopedDoctypes(FrappeTestCase):
	def test_mandatory_company_only(self):
		self.assertTrue(company_utils.company_scoped("Sales Invoice"))
		self.assertTrue(company_utils.company_scoped("Payment Entry"))
		self.assertFalse(company_utils.company_scoped("Customer"))
		self.assertFalse(company_utils.company_scoped("Company"))


class TestActiveCompany(FrappeTestCase):
	def setUp(self):
		self.companies = frappe.get_all("Company", pluck="name", limit=2)
		if len(self.companies) < 2:
			self.skipTest("needs two companies")
		self.user = frappe.session.user
		self._saved = frappe.defaults.get_defaults_for(self.user).get(company_utils.ACTIVE_COMPANY_KEY)

	def tearDown(self):
		if self._saved:
			frappe.defaults.set_user_default(company_utils.ACTIVE_COMPANY_KEY, self._saved, user=self.user)
		else:
			frappe.defaults.clear_user_default(company_utils.ACTIVE_COMPANY_KEY, user=self.user)

	def test_switch_persists_after_session_default_cleared(self):
		target = self.companies[1]
		company_utils.set_active_company(target)
		self.assertEqual(company_utils.get_default_company(), target)
		# What logout does (Session Default Settings → clear_session_defaults).
		frappe.defaults.clear_user_default("company", user=self.user)
		self.assertEqual(company_utils.get_default_company(), target)
		company_utils.restore_active_company()
		self.assertEqual(frappe.defaults.get_user_default("Company"), target)

	def test_rejects_unknown_company(self):
		with self.assertRaises(frappe.PermissionError):
			company_utils.set_active_company("No Such Company Ltd")

	def test_list_my_companies_shape(self):
		from taxmate.api.company import list_my_companies

		out = list_my_companies()
		self.assertIn("active", out)
		names = {row.name for row in out["companies"]}
		self.assertTrue(set(self.companies) <= names)

	def test_get_list_follows_switch(self):
		target = self.companies[0]
		company_utils.set_active_company(target)
		rows = resource.get_list("Sales Invoice", fields='["name","company"]', limit_page_length=50)
		self.assertTrue(all(r.company == target for r in rows))

	def test_get_adopts_document_company(self):
		"""Deep-linked Account from another permitted company must open.

		Covers SPA Account detail: controller has_permission follows the active
		company, so resource.get adopts the document's company when allowed.
		"""
		first, second = self.companies[0], self.companies[1]
		account = frappe.db.get_value("Account", {"company": second, "is_group": 0}, "name")
		if not account:
			self.skipTest("needs a leaf Account on the second company")
		company_utils.set_active_company(first)
		self.assertEqual(company_utils.get_default_company(), first)
		doc = resource.get("Account", account)
		self.assertEqual(doc.get("name") or doc.name, account)
		self.assertEqual(company_utils.get_default_company(), second)
