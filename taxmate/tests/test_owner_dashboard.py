"""Owner dashboard — period maths, ageing buckets, budget proration, and a
smoke run of the endpoint against the test site.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_owner_dashboard
"""

from __future__ import annotations

import json
import unittest
from datetime import date

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api.owner_dashboard import (
	PERIODS,
	age_bucket,
	bucket_by_month,
	get_owner_dashboard,
	month_keys,
	period_bounds,
	prorate,
)

D = date


class TestPeriodBounds(unittest.TestCase):
	def test_month_compares_same_number_of_days(self):
		b = period_bounds("month", D(2026, 9, 21))
		self.assertEqual((b["start"], b["end"]), (D(2026, 9, 1), D(2026, 9, 21)))
		self.assertEqual((b["prev_start"], b["prev_end"]), (D(2026, 8, 1), D(2026, 8, 21)))

	def test_previous_month_never_runs_into_the_current_one(self):
		b = period_bounds("month", D(2026, 3, 31))
		self.assertEqual((b["prev_start"], b["prev_end"]), (D(2026, 2, 1), D(2026, 2, 28)))

	def test_quarter(self):
		b = period_bounds("quarter", D(2026, 9, 21))
		self.assertEqual((b["start"], b["prev_start"], b["prev_end"]), (D(2026, 7, 1), D(2026, 4, 1), D(2026, 6, 22)))

	def test_year_is_last_twelve_months(self):
		b = period_bounds("year", D(2026, 9, 21))
		self.assertEqual((b["start"], b["prev_start"], b["prev_end"]), (D(2025, 10, 1), D(2024, 10, 1), D(2025, 9, 21)))

	def test_unknown_period_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			period_bounds("week", D(2026, 9, 21))


class TestHelpers(unittest.TestCase):
	def test_month_keys(self):
		keys = month_keys(D(2026, 1, 5))
		self.assertEqual((len(keys), keys[0], keys[-1]), (12, "2025-02", "2026-01"))

	def test_age_bucket_edges(self):
		on = D(2026, 9, 21)
		cases = {
			None: "current",
			D(2026, 9, 21): "current",
			D(2026, 9, 20): "1_30",
			D(2026, 8, 22): "1_30",
			D(2026, 8, 21): "31_60",
			D(2026, 7, 22): "61_90",
			D(2026, 6, 22): "90_plus",
		}
		for due, expected in cases.items():
			self.assertEqual(age_bucket(due, on), expected, due)

	def test_prorate(self):
		self.assertAlmostEqual(prorate(36500, D(2026, 9, 1), D(2026, 9, 21), D(2026, 1, 1), D(2026, 12, 31)), 2100)
		self.assertEqual(prorate(1000, D(2027, 1, 1), D(2027, 1, 5), D(2026, 1, 1), D(2026, 12, 31)), 0.0)

	def test_bucket_by_month_ignores_rows_outside_the_window(self):
		rows = [{"d": D(2026, 9, 3), "v": 5}, {"d": "2026-09-30", "v": "2"}, {"d": D(2024, 1, 1), "v": 9}]
		self.assertEqual(bucket_by_month(rows, ["2026-08", "2026-09"], "d", "v"), [0.0, 7.0])


class TestEndpoint(FrappeTestCase):
	def test_every_period_returns_a_serialisable_payload(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No company on this site")
		for period in PERIODS:
			data = get_owner_dashboard(period=period, company=company)
			json.dumps(data, default=str)
			self.assertEqual(len(data["months"]), 12)
			self.assertIn("flows", data)
			for key in ("invoiced", "bills", "received", "paid"):
				flow = data["flows"][key]
				if flow is not None:
					self.assertEqual(len(flow["by_month"]), 12)
