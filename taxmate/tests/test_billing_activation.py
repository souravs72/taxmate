"""Subscription activation after SaaS invoice payment.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_billing_activation
"""

from __future__ import annotations

import unittest

import frappe
from frappe.utils import add_days, today

from taxmate.billing.constants import STATUS_ACTIVE, STATUS_UNPAID, SUBSCRIPTION_DOCTYPE
from taxmate.billing.entitlement import company_may_access
from taxmate.billing.payment import activate_subscription
from taxmate.billing.trial import ensure_company_trial


class TestBillingActivation(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 1)
		self.company = frappe.db.get_value("Company", {}, "name")
		ensure_company_trial(self.company)
		name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "name")
		frappe.db.set_value(SUBSCRIPTION_DOCTYPE, name, "status", STATUS_UNPAID)

	def tearDown(self):
		frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 0)

	def test_activate_sets_active_period(self):
		activate_subscription(self.company, "retail", "Annual", sales_invoice="TEST-SI-1")
		row = frappe.db.get_value(
			SUBSCRIPTION_DOCTYPE,
			{"company": self.company},
			["status", "plan", "billing_cycle", "current_period_end", "last_sales_invoice"],
			as_dict=True,
		)
		self.assertEqual(row.status, STATUS_ACTIVE)
		self.assertEqual(row.plan, "retail")
		self.assertEqual(row.billing_cycle, "Annual")
		self.assertEqual(row.last_sales_invoice, "TEST-SI-1")
		self.assertTrue(row.current_period_end)
		self.assertTrue(company_may_access(self.company, "Administrator"))

	def test_activate_idempotent_same_invoice(self):
		activate_subscription(self.company, "retail", "Monthly", sales_invoice="TEST-SI-2")
		end1 = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "current_period_end")
		activate_subscription(self.company, "retail", "Monthly", sales_invoice="TEST-SI-2")
		end2 = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "current_period_end")
		self.assertEqual(str(end1), str(end2))

	def test_list_plans_catalogued(self):
		from taxmate.api import get_catalog
		from taxmate.api.billing import list_plans

		methods = {a["method"] for a in get_catalog()["actions"]}
		self.assertIn("taxmate.api.billing.list_plans", methods)
		self.assertIn("taxmate.api.billing.start_checkout", methods)
		plans = list_plans()
		codes = {p["name"] for p in plans}
		self.assertTrue({"starter", "retail", "multi_outlet"} <= codes)
