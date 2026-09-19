"""E-invoicing mandate cohort/dates (MD 244/2025 as amended by Res. 66/2026)."""

from __future__ import annotations

import unittest

from taxmate.uae_e_invoicing.constants import (
	EINVOICE_CLASSIFY_TODO_KEY,
	EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED,
	EINVOICE_MANDATE_PHASES,
	EINVOICE_MANDATE_REMINDER_WINDOW_DAYS,
	EINVOICE_MANDATE_TODO_KEY,
	EINVOICE_REVENUE_BAND_AT_OR_ABOVE,
	EINVOICE_REVENUE_BAND_BELOW,
)
from taxmate.uae_e_invoicing.utils.mandate import (
	determine_cohort,
	get_phase_dates,
	mandate_reminder_payload,
	mandate_status,
)


class TestDetermineCohort(unittest.TestCase):
	def test_below_threshold_is_sme(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED - 1,
				government=False,
				override="",
			),
			"SME",
		)

	def test_exactly_at_threshold_is_large(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED,
				government=False,
				override="",
			),
			"Large",
		)

	def test_above_threshold_is_large(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED + 1,
				government=False,
				override="",
			),
			"Large",
		)

	def test_zero_revenue_is_sme(self):
		self.assertEqual(
			determine_cohort("Acme UAE", revenue=0, government=False, override=""),
			"SME",
		)

	def test_fs_band_above_is_large(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue_band=EINVOICE_REVENUE_BAND_AT_OR_ABOVE,
				government=False,
				override="",
			),
			"Large",
		)

	def test_fs_band_below_is_sme(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue_band=EINVOICE_REVENUE_BAND_BELOW,
				government=False,
				override="",
			),
			"SME",
		)

	def test_missing_band_is_unclassified(self):
		self.assertEqual(
			determine_cohort("Acme UAE", government=False, override=""),
			"Unclassified",
		)

	def test_auto_override_is_ignored(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue_band=EINVOICE_REVENUE_BAND_BELOW,
				government=False,
				override="Auto",
			),
			"SME",
		)

	def test_override_wins_over_revenue(self):
		self.assertEqual(
			determine_cohort("Acme UAE", revenue=999_999_999, override="Pilot", government=False),
			"Pilot",
		)

	def test_government_wins_over_band(self):
		self.assertEqual(
			determine_cohort(
				"Acme UAE",
				revenue_band=EINVOICE_REVENUE_BAND_BELOW,
				government=True,
				override="",
			),
			"Government",
		)

	def test_does_not_use_gl_helper(self):
		import taxmate.uae_e_invoicing.utils.mandate as mandate_mod

		self.assertFalse(hasattr(mandate_mod, "company_annual_revenue"))


class TestPhaseDates(unittest.TestCase):
	def test_known_cohorts_defined(self):
		self.assertEqual(
			set(EINVOICE_MANDATE_PHASES.keys()),
			{"Unclassified", "Pilot", "Large", "SME", "Government"},
		)

	def test_large_dates_follow_res_66_2026(self):
		phase = get_phase_dates("Large")
		self.assertEqual(phase["asp_deadline"], "2026-10-30")
		self.assertEqual(phase["go_live"], "2027-01-01")

	def test_sme_dates(self):
		phase = get_phase_dates("SME")
		self.assertEqual(phase["asp_deadline"], "2027-03-31")
		self.assertEqual(phase["go_live"], "2027-07-01")

	def test_government_dates(self):
		phase = get_phase_dates("Government")
		self.assertEqual(phase["asp_deadline"], "2027-03-31")
		self.assertEqual(phase["go_live"], "2027-10-01")

	def test_pilot_has_no_asp_deadline(self):
		phase = get_phase_dates("Pilot")
		self.assertIsNone(phase["asp_deadline"])
		self.assertEqual(phase["go_live"], "2026-07-01")

	def test_unclassified_has_no_dates(self):
		phase = get_phase_dates("Unclassified")
		self.assertIsNone(phase["asp_deadline"])
		self.assertIsNone(phase["go_live"])

	def test_unknown_cohort_raises(self):
		with self.assertRaises((ValueError, Exception)):
			get_phase_dates("Not A Cohort")


class TestMandateStatus(unittest.TestCase):
	def test_large_company_well_before_deadline(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-01-01",
			revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED + 1,
			government=False,
			override="",
		)
		self.assertEqual(status["cohort"], "Large")
		self.assertEqual(status["asp_appointment_deadline"], "2026-10-30")
		self.assertFalse(status["asp_deadline_passed"])
		self.assertFalse(status["mandate_live"])
		self.assertEqual(status["days_to_asp_deadline"], 302)

	def test_large_company_after_july_is_still_before_asp(self):
		"""Res. 66/2026 moved Large ASP from 31 Jul to 30 Oct 2026."""
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-09-01",
			revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED + 1,
			government=False,
			override="",
		)
		self.assertFalse(status["asp_deadline_passed"])
		self.assertEqual(status["days_to_asp_deadline"], 59)

	def test_large_company_after_asp_deadline(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-11-01",
			revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED + 1,
			government=False,
			override="",
		)
		self.assertTrue(status["asp_deadline_passed"])
		self.assertFalse(status["mandate_live"])

	def test_large_company_after_go_live(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2027-02-01",
			revenue=EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED + 1,
			government=False,
			override="",
		)
		self.assertTrue(status["mandate_live"])

	def test_sme_company_dates_differ_from_large(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-01-01",
			revenue=1,
			government=False,
			override="",
		)
		self.assertEqual(status["cohort"], "SME")
		self.assertEqual(status["asp_appointment_deadline"], "2027-03-31")
		self.assertEqual(status["go_live_date"], "2027-07-01")

	def test_unclassified_has_no_deadlines(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-09-11",
			revenue_band="",
			government=False,
			override="",
		)
		self.assertEqual(status["cohort"], "Unclassified")
		self.assertIsNone(status["asp_appointment_deadline"])
		self.assertIsNone(status["days_to_asp_deadline"])
		self.assertFalse(status["mandate_live"])

	def test_disclaimer_names_res_66_and_rejects_gl(self):
		status = mandate_status("Acme UAE", as_of_date="2026-01-01", revenue=1, government=False, override="")
		self.assertIn("66/2026", status["disclaimer"])
		self.assertIn("30 Oct 2026", status["disclaimer"])
		self.assertIn("not TaxMate's general ledger", status["disclaimer"])


class TestMandateReminderPayload(unittest.TestCase):
	def test_unclassified_asks_for_fs_band(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-09-11",
			revenue_band="",
			government=False,
			override="",
		)
		payload = mandate_reminder_payload(status, EINVOICE_MANDATE_REMINDER_WINDOW_DAYS)
		self.assertIsNotNone(payload)
		self.assertEqual(payload["unique_key"], EINVOICE_CLASSIFY_TODO_KEY)
		self.assertEqual(payload["kind"], "classify")

	def test_large_in_asp_window_on_11_sep_2026(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-09-11",
			revenue_band=EINVOICE_REVENUE_BAND_AT_OR_ABOVE,
			government=False,
			override="",
		)
		payload = mandate_reminder_payload(status, EINVOICE_MANDATE_REMINDER_WINDOW_DAYS)
		self.assertIsNotNone(payload)
		self.assertEqual(payload["unique_key"], EINVOICE_MANDATE_TODO_KEY)
		self.assertEqual(payload["asp_appointment_deadline"], "2026-10-30")
		self.assertIn("asp_upcoming", payload["reasons"])
		self.assertNotEqual(payload["asp_appointment_deadline"], "2026-07-31")

	def test_sme_far_from_deadlines_is_silent(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-09-11",
			revenue_band=EINVOICE_REVENUE_BAND_BELOW,
			government=False,
			override="",
		)
		self.assertIsNone(mandate_reminder_payload(status, EINVOICE_MANDATE_REMINDER_WINDOW_DAYS))

	def test_go_live_window_after_asp(self):
		status = mandate_status(
			"Acme UAE",
			as_of_date="2026-12-15",
			revenue_band=EINVOICE_REVENUE_BAND_AT_OR_ABOVE,
			government=False,
			override="",
		)
		payload = mandate_reminder_payload(status, EINVOICE_MANDATE_REMINDER_WINDOW_DAYS)
		self.assertIsNotNone(payload)
		self.assertEqual(payload["go_live_date"], "2027-01-01")
		self.assertIn("go_live_upcoming", payload["reasons"])
		self.assertIn("asp_passed", payload["reasons"])


class TestMandateCustomFields(unittest.TestCase):
	def test_company_fields_declared(self):
		from taxmate.uae_e_invoicing.constants.custom_fields import CUSTOM_FIELDS

		names = {field["fieldname"] for field in CUSTOM_FIELDS["Company"]}
		self.assertEqual(
			names,
			{
				"uae_e_invoice_mandate_section",
				"uae_is_government_entity",
				"uae_e_invoice_revenue_band",
				"uae_e_invoice_cohort_override",
			},
		)
		band = next(f for f in CUSTOM_FIELDS["Company"] if f["fieldname"] == "uae_e_invoice_revenue_band")
		self.assertIn(EINVOICE_REVENUE_BAND_BELOW, band["options"])
		self.assertIn(EINVOICE_REVENUE_BAND_AT_OR_ABOVE, band["options"])


class TestMandateFieldsAfterMigrate(unittest.TestCase):
	def test_company_columns_exist(self):
		try:
			import frappe
		except Exception:
			self.skipTest("frappe not importable")
		try:
			if not getattr(frappe.local, "site", None) or frappe.db is None:
				self.skipTest("No Frappe site")
		except RuntimeError:
			self.skipTest("No Frappe site")
		for fieldname in (
			"uae_is_government_entity",
			"uae_e_invoice_revenue_band",
			"uae_e_invoice_cohort_override",
		):
			self.assertTrue(
				frappe.db.has_column("Company", fieldname),
				f"Company.{fieldname} missing — run migrate so e-invoicing setup creates it",
			)
