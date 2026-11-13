"""Billing RBAC: gateway docs denied in SPA; accountants inherit access; owners manage.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_billing_rbac
"""

from __future__ import annotations

import uuid
import unittest

import frappe
from frappe.utils import add_days, today

from taxmate.api.resource import is_allowed_doctype
from taxmate.billing.constants import STATUS_ACTIVE, STATUS_UNPAID, SUBSCRIPTION_DOCTYPE
from taxmate.billing.entitlement import company_may_access, session_billing
from taxmate.billing.trial import ensure_company_trial
from taxmate.search import DENIED_SEARCH_DOCTYPES
from taxmate.setup.company_owner import OWNER_FIELD, ensure_company_owner_field
from taxmate.setup.spa_roles import MARKER, ensure_spa_roles


class TestBillingRbac(unittest.TestCase):
	def setUp(self):
		ensure_spa_roles()
		ensure_company_owner_field()
		frappe.set_user("Administrator")
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 1)
		self.company = frappe.db.get_value("Company", {}, "name")
		ensure_company_trial(self.company)
		self._users: list[str] = []

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 0)
		for name in self._users:
			for up in frappe.get_all("User Permission", filters={"user": name}, pluck="name"):
				frappe.delete_doc("User Permission", up, force=True, ignore_permissions=True)
			if frappe.db.exists("User", name):
				frappe.delete_doc("User", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _user(self, role_key: str) -> str:
		email = f"rbac_{role_key}_{uuid.uuid4().hex[:6]}@example.com"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": role_key.title(),
				"send_welcome_email": 0,
				"roles": [{"role": MARKER[role_key]}],
			}
		).insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "User Permission",
				"user": user.name,
				"allow": "Company",
				"for_value": self.company,
			}
		).insert(ignore_permissions=True)
		self._users.append(user.name)
		return user.name

	def test_gateway_doctypes_denied_from_spa(self):
		for dt in (
			"Stripe Settings",
			"Payment Gateway",
			"Payment Gateway Account",
			"Integration Request",
			"TaxMate Plan",
		):
			self.assertIn(dt, DENIED_SEARCH_DOCTYPES)
			self.assertFalse(is_allowed_doctype(dt))

	def test_accountant_inherits_active_access_but_cannot_manage(self):
		name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "name")
		frappe.db.set_value(
			SUBSCRIPTION_DOCTYPE,
			name,
			{
				"status": STATUS_ACTIVE,
				"plan": "retail",
				"billing_cycle": "Annual",
				"current_period_start": today(),
				"current_period_end": add_days(today(), 30),
			},
		)
		acct = self._user("accountant")
		self.assertTrue(company_may_access(self.company, acct))
		billing = session_billing(self.company, acct)
		self.assertTrue(billing["can_access"])
		self.assertFalse(billing["can_manage_billing"])

	def test_owner_can_manage_when_mapped(self):
		owner = self._user("owner")
		frappe.db.set_value("Company", self.company, OWNER_FIELD, owner)
		name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "name")
		frappe.db.set_value(SUBSCRIPTION_DOCTYPE, name, "status", STATUS_UNPAID)
		billing = session_billing(self.company, owner)
		self.assertTrue(billing["can_manage_billing"])
		self.assertFalse(billing["can_access"])
