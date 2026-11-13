"""Company billing entitlement and API gate.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_billing_entitlement
"""

from __future__ import annotations

import uuid
import unittest

import frappe
from frappe.utils import add_days, today

from taxmate.billing.constants import STATUS_ACTIVE, STATUS_TRIAL, STATUS_UNPAID, SUBSCRIPTION_DOCTYPE
from taxmate.billing.entitlement import company_may_access, require_company_entitlement, session_billing
from taxmate.billing.trial import ensure_company_trial
from taxmate.setup.spa_roles import MARKER, ensure_spa_roles


class TestBillingEntitlement(unittest.TestCase):
	def setUp(self):
		ensure_spa_roles()
		frappe.set_user("Administrator")
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 1)
		self.company = frappe.db.get_value("Company", {}, "name")
		self.assertTrue(self.company)
		ensure_company_trial(self.company)
		self._users: list[str] = []

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 0)
		for name in getattr(self, "_users", []):
			if frappe.db.exists("User Permission", {"user": name, "allow": "Company"}):
				for up in frappe.get_all("User Permission", filters={"user": name}, pluck="name"):
					frappe.delete_doc("User Permission", up, force=True, ignore_permissions=True)
			if frappe.db.exists("User", name):
				frappe.delete_doc("User", name, force=True, ignore_permissions=True)
		frappe.db.commit()

	def _sub(self) -> str:
		return frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "name")

	def _make_member(self) -> str:
		email = f"bill_{uuid.uuid4().hex[:8]}@example.com"
		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "Bill",
				"send_welcome_email": 0,
				"roles": [{"role": MARKER["clerk"]}],
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

	def test_provider_always_allowed(self):
		name = self._sub()
		frappe.db.set_value(SUBSCRIPTION_DOCTYPE, name, "status", STATUS_UNPAID)
		self.assertTrue(company_may_access(self.company, "Administrator"))

	def test_billing_disabled_allows_member(self):
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 0)
		name = self._sub()
		frappe.db.set_value(SUBSCRIPTION_DOCTYPE, name, "status", STATUS_UNPAID)
		member = self._make_member()
		self.assertTrue(company_may_access(self.company, member))

	def test_expired_trial_blocks_member(self):
		name = self._sub()
		frappe.db.set_value(
			SUBSCRIPTION_DOCTYPE,
			name,
			{"status": STATUS_TRIAL, "trial_ends_on": add_days(today(), -1)},
		)
		member = self._make_member()
		self.assertFalse(company_may_access(self.company, member))
		frappe.set_user(member)
		with self.assertRaises(frappe.PermissionError):
			require_company_entitlement(self.company)

	def test_active_period_allows_member(self):
		name = self._sub()
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
		member = self._make_member()
		self.assertTrue(company_may_access(self.company, member))
		billing = session_billing(self.company, member)
		self.assertTrue(billing["can_access"])
		self.assertEqual(billing["status"], STATUS_ACTIVE)
		self.assertFalse(billing["can_manage_billing"])

	def test_session_billing_for_provider(self):
		payload = session_billing(self.company, "Administrator")
		self.assertTrue(payload["enabled"])
		self.assertTrue(payload["can_access"])
		self.assertTrue(payload["can_manage_billing"])

	def test_get_session_includes_billing(self):
		from taxmate.api import get_session

		frappe.set_user("Administrator")
		session = get_session()
		self.assertIn("billing", session)
		self.assertIn("can_access", session["billing"])
