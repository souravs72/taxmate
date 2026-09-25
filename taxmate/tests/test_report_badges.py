"""Report badges — period labelling, the per-badge helpers, and a smoke run
of the endpoint against the test site.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_report_badges
"""

from __future__ import annotations

import json
import unittest
from datetime import date

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import getdate, today

from taxmate.api.report_badges import (
	TOLERANCE,
	_badge,
	_period_label,
	get_report_badges,
)

D = date

TONES = {"ok", "warn", "bad"}
BADGE_REPORTS = {
	"Trial Balance",
	"UAE VAT 201",
	"UAE E-Invoice Status",
	"UAE Late Filing Status",
	"UAE Corporate Tax Worksheet",
	"UAE Compliance Status",
}


def period(start, end):
	return frappe._dict(period_start=start, period_end=end)


class TestPeriodLabel(unittest.TestCase):
	def test_calendar_quarters(self):
		self.assertEqual(_period_label(period(D(2026, 1, 1), D(2026, 3, 31))), "Q1")
		self.assertEqual(_period_label(period(D(2026, 4, 1), D(2026, 6, 30))), "Q2")
		self.assertEqual(_period_label(period(D(2026, 7, 1), D(2026, 9, 30))), "Q3")
		self.assertEqual(_period_label(period(D(2026, 10, 1), D(2026, 12, 31))), "Q4")

	def test_single_month(self):
		self.assertEqual(_period_label(period(D(2026, 9, 1), D(2026, 9, 30))), "Sep")
		self.assertEqual(_period_label(period(D(2026, 2, 1), D(2026, 2, 28))), "Feb")

	def test_staggered_quarter_is_not_numbered(self):
		# The FTA assigns quarters that do not line up with the calendar.
		self.assertEqual(_period_label(period(D(2026, 2, 1), D(2026, 4, 30))), "Feb–Apr")
		self.assertEqual(_period_label(period(D(2026, 8, 1), D(2026, 10, 31))), "Aug–Oct")
		self.assertEqual(_period_label(period(D(2026, 11, 1), D(2027, 1, 31))), "Nov–Jan")

	def test_other_spans(self):
		self.assertEqual(_period_label(period(D(2026, 8, 1), D(2026, 9, 30))), "Aug–Sep")
		self.assertEqual(_period_label(period(D(2026, 7, 1), D(2026, 10, 31))), "Jul–Oct")

	def test_missing_dates(self):
		self.assertEqual(_period_label(period(None, D(2026, 9, 30))), "")
		self.assertEqual(_period_label(period(D(2026, 9, 1), None)), "")


class TestBadgeShape(unittest.TestCase):
	def test_badge_carries_tone_key_and_vars(self):
		self.assertEqual(_badge("ok", "balanced"), {"tone": "ok", "key": "balanced"})
		self.assertEqual(
			_badge("bad", "needAction", count=3),
			{"tone": "bad", "key": "needAction", "count": 3},
		)

	def test_tolerance_is_small_and_positive(self):
		self.assertGreater(TOLERANCE, 0)
		self.assertLessEqual(TOLERANCE, 1)


class TestEndpoint(FrappeTestCase):
	def company(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No company on this site")
		return company

	def test_payload_is_serialisable_and_well_formed(self):
		company = self.company()
		data = get_report_badges(company)
		json.dumps(data)  # dates are already strings
		self.assertEqual(data["company"], company)
		self.assertEqual(data["today"], str(getdate(today())))
		self.assertEqual(set(data), {"company", "today", "badges"})
		for report, badge in data["badges"].items():
			self.assertIn(report, BADGE_REPORTS, f"unexpected badge for {report}")
			self.assertIn(badge["tone"], TONES)
			self.assertTrue(badge["key"])
			for value in badge.values():
				self.assertIsInstance(value, (str, int, float, type(None)))

	def test_no_badge_is_reported_as_zero(self):
		"""A badge the role cannot see is absent; it is never present with 0."""
		data = get_report_badges(self.company())
		for report, badge in data["badges"].items():
			if "count" in badge and badge["count"] == 0:
				self.fail(f"{report} came back with count 0 instead of an 'all clear' key")

	def test_badges_match_readable_doctypes(self):
		data = get_report_badges(self.company())
		pairs = {
			"UAE VAT 201": "UAE VAT 201 Filing Log",
			"UAE E-Invoice Status": "UAE E-Invoice Log",
			"UAE Late Filing Status": "UAE Late Filing Notice",
			"UAE Corporate Tax Worksheet": "UAE CT Filing Log",
			"Trial Balance": "GL Entry",
		}
		for report, doctype in pairs.items():
			readable = bool(frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read"))
			if not readable:
				self.assertNotIn(report, data["badges"], f"{report} shown without read access to {doctype}")

	def test_endpoint_is_whitelisted(self):
		self.assertIn(get_report_badges, frappe.whitelisted)

	def test_the_menu_stays_cheap(self):
		"""The Reports screen is a menu: one small query per badge, nothing per row."""
		company = self.company()
		calls = []
		original = frappe.get_list

		def counting_get_list(doctype, *args, **kwargs):
			calls.append(doctype)
			return original(doctype, *args, **kwargs)

		frappe.get_list = counting_get_list
		try:
			get_report_badges(company)
		finally:
			frappe.get_list = original
		self.assertLessEqual(len(calls), 8, f"too many queries for a menu: {calls}")
