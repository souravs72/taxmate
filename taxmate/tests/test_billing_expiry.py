"""Daily expiry flips Trial→Unpaid and Active→Past Due."""

from __future__ import annotations

import unittest

import frappe
from frappe.utils import add_days, today

from taxmate.billing.constants import STATUS_ACTIVE, STATUS_PAST_DUE, STATUS_TRIAL, STATUS_UNPAID, SUBSCRIPTION_DOCTYPE
from taxmate.billing.entitlement import sync_expired_statuses
from taxmate.billing.trial import ensure_company_trial


class TestBillingExpiry(unittest.TestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.company = frappe.db.get_value("Company", {}, "name")
		ensure_company_trial(self.company)

	def test_trial_expires(self):
		name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "name")
		frappe.db.set_value(
			SUBSCRIPTION_DOCTYPE,
			name,
			{"status": STATUS_TRIAL, "trial_ends_on": add_days(today(), -1)},
		)
		sync_expired_statuses()
		self.assertEqual(frappe.db.get_value(SUBSCRIPTION_DOCTYPE, name, "status"), STATUS_UNPAID)

	def test_active_period_expires(self):
		name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": self.company}, "name")
		frappe.db.set_value(
			SUBSCRIPTION_DOCTYPE,
			name,
			{
				"status": STATUS_ACTIVE,
				"current_period_end": add_days(today(), -1),
				"plan": "retail",
				"billing_cycle": "Monthly",
			},
		)
		sync_expired_statuses()
		self.assertEqual(frappe.db.get_value(SUBSCRIPTION_DOCTYPE, name, "status"), STATUS_PAST_DUE)
