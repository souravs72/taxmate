"""Accountant dashboard — month maths, currency conversion, ageing by party,
and a smoke run of the endpoint against the test site.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_accountant_dashboard
"""

from __future__ import annotations

import json
import unittest
from datetime import date

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate, today

from taxmate.api.accountant_dashboard import (
	MONTHS_SHOWN,
	TOP_PARTIES,
	activity_verb,
	ageing_by_party,
	filed_period_for,
	get_accountant_dashboard,
	month_bounds,
	month_options,
	to_company_currency,
)

D = date


class TestMonths(unittest.TestCase):
	def test_month_options_oldest_first(self):
		self.assertEqual(month_options(D(2026, 9, 21)), ["2026-07", "2026-08", "2026-09"])

	def test_month_options_cross_the_year(self):
		self.assertEqual(month_options(D(2026, 1, 31)), ["2025-11", "2025-12", "2026-01"])

	def test_month_bounds(self):
		self.assertEqual(month_bounds("2026-09"), (D(2026, 9, 1), D(2026, 9, 30)))
		self.assertEqual(month_bounds("2026-12"), (D(2026, 12, 1), D(2026, 12, 31)))

	def test_month_bounds_february(self):
		self.assertEqual(month_bounds("2024-02"), (D(2024, 2, 1), D(2024, 2, 29)))
		self.assertEqual(month_bounds("2026-02"), (D(2026, 2, 1), D(2026, 2, 28)))

	def test_bad_month_is_refused(self):
		for bad in ("2026-13", "Sept", "2026"):
			with self.assertRaises(frappe.ValidationError):
				month_bounds(bad)


class TestHelpers(unittest.TestCase):
	def test_unallocated_in_company_currency(self):
		receive = {"payment_type": "Receive", "unallocated_amount": 100, "source_exchange_rate": 3.6725, "target_exchange_rate": 1}
		pay = {"payment_type": "Pay", "unallocated_amount": 100, "source_exchange_rate": 1, "target_exchange_rate": 3.6725}
		self.assertAlmostEqual(to_company_currency(receive), 367.25)
		self.assertAlmostEqual(to_company_currency(pay), 367.25)
		self.assertEqual(to_company_currency({"payment_type": "Pay", "unallocated_amount": 100}), 100.0)

	def test_ageing_by_party_top_six_then_others(self):
		on = D(2026, 9, 21)
		rows = [{"party": f"P{i}", "label": f"Party {i}", "due_date": D(2026, 9, 30), "v": 100 * (i + 1)} for i in range(8)]
		rows.append({"party": "P0", "label": "Party 0", "due_date": D(2026, 6, 1), "v": 1000})
		data = ageing_by_party(rows, on)
		self.assertEqual(len(data["rows"]), TOP_PARTIES)
		self.assertEqual(data["parties"], 8)
		self.assertEqual(data["others"]["count"], 2)
		self.assertEqual(data["rows"][0]["party"], "P0")
		self.assertEqual(data["rows"][0]["buckets"], [100.0, 0.0, 0.0, 0.0, 1000.0])
		self.assertAlmostEqual(data["total"]["total"], sum(r["v"] for r in rows))
		self.assertAlmostEqual(data["total"]["total"], sum(r["total"] for r in data["rows"]) + data["others"]["total"])

	def test_ageing_by_party_without_others(self):
		data = ageing_by_party([{"party": "A", "label": "A", "due_date": None, "v": 5}], D(2026, 9, 21))
		self.assertIsNone(data["others"])
		self.assertEqual(data["total"]["buckets"], [5.0, 0.0, 0.0, 0.0, 0.0])

	def test_filed_period_for(self):
		filed = [{"name": "Q2", "start": D(2026, 4, 1), "end": D(2026, 6, 30)}]
		self.assertEqual(filed_period_for(D(2026, 6, 30), filed)["name"], "Q2")
		self.assertEqual(filed_period_for(D(2026, 4, 1), filed)["name"], "Q2")
		self.assertIsNone(filed_period_for(D(2026, 7, 1), filed))
		self.assertIsNone(filed_period_for(None, filed))

	def test_activity_verb(self):
		self.assertEqual(activity_verb(1, None), "submitted")
		self.assertEqual(activity_verb(1, "SINV-0001"), "amended")
		self.assertEqual(activity_verb(2, "SINV-0001"), "cancelled")


class TestEndpoint(FrappeTestCase):
	def test_every_month_returns_a_serialisable_payload(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No company on this site")
		months = month_options(getdate(today()))
		self.assertEqual(len(months), MONTHS_SHOWN)
		for month in months:
			data = get_accountant_dashboard(month=month, company=company)
			json.dumps(data)  # dates are already strings
			self.assertEqual(data["month"], month)
			self.assertEqual([m["key"] for m in data["months"]], months)
			self.assertEqual(data["close"]["month"], month)
			self.assertEqual(data["close"]["total"], len(data["close"]["steps"]))
			self.assertEqual(data["close"]["steps"][-1]["key"], "lock")
			for key in ("drafts", "unallocated", "bank", "einvoice", "data", "late"):
				self.assertIn(key, data["queues"])
			for side in ("receivable", "payable"):
				ageing = data["ageing"][side]
				if ageing is not None:
					parts = sum(r["total"] for r in ageing["rows"]) + (ageing["others"]["total"] if ageing["others"] else 0)
					self.assertAlmostEqual(parts, ageing["total"]["total"], places=2)

	def test_unknown_month_falls_back_to_current(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No company on this site")
		data = get_accountant_dashboard(month="1999-01", company=company)
		self.assertEqual(data["month"], month_options(getdate(today()))[-1])
