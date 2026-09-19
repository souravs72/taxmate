"""Phase 4 UAE Corporate Tax arithmetic (no site fixtures required)."""

from __future__ import annotations

import unittest

import inspect

from taxmate.uae_corporate_tax.utils.corporate_tax import (
	compute_ct,
	de_minimis_ok,
	fetch_gl_totals,
	filing_deadline_status,
	filing_due_date,
	qfzp_tax,
	sbr_available,
	standard_tax,
	taxable_profit,
)


class TestBridge(unittest.TestCase):
	def test_add_backs_and_deductions(self):
		self.assertEqual(
			taxable_profit(
				1000,
				[
					{"adjustment_type": "Add-back", "amount": 200},
					{"adjustment_type": "Deduction", "amount": 50},
				],
			),
			1150.0,
		)


class TestStandardRate(unittest.TestCase):
	def test_zero_inside_band(self):
		self.assertEqual(standard_tax(375_000), 0.0)

	def test_nine_percent_above_band(self):
		self.assertEqual(standard_tax(475_000), 9000.0)


class TestSmallBusinessRelief(unittest.TestCase):
	def test_eligible_under_three_million(self):
		self.assertTrue(sbr_available(2_999_999, 0, "2026-12-31"))

	def test_ineligible_if_prior_exceeded(self):
		self.assertFalse(sbr_available(1_000_000, 3_000_001, "2026-12-31"))

	def test_ineligible_after_2026(self):
		self.assertFalse(sbr_available(1_000_000, 0, "2027-12-31"))

	def test_ineligible_falls_back_to_standard(self):
		result = compute_ct(
			"Test Co",
			"2026-01-01",
			"2026-12-31",
			elect_sbr=1,
			elect_qfzp=0,
			settings={},
			gl={"revenue": 4_000_000, "expenses": 3_400_000, "accounting_profit": 600_000},
			split={"qualifying_revenue": 0, "non_qualifying_revenue": 0, "unclassified_revenue": 0},
			prior=0,
		)
		self.assertEqual(result["regime"], "Standard")
		self.assertEqual(result["taxable_profit"], 600_000.0)
		self.assertEqual(result["tax_payable"], 20_250.0)

	def test_compute_zeros_taxable(self):
		result = compute_ct(
			"Test Co",
			"2026-01-01",
			"2026-12-31",
			elect_sbr=1,
			elect_qfzp=0,
			settings={},
			gl={"revenue": 1_000_000, "expenses": 400_000, "accounting_profit": 600_000},
			split={"qualifying_revenue": 0, "non_qualifying_revenue": 0, "unclassified_revenue": 0},
			prior=0,
		)
		self.assertEqual(result["regime"], "Small Business Relief")
		self.assertEqual(result["taxable_profit"], 0.0)
		self.assertEqual(result["tax_payable"], 0.0)


class TestQfzp(unittest.TestCase):
	def test_de_minimis_lower_of_five_percent_or_five_million(self):
		self.assertTrue(de_minimis_ok(40_000, 1_000_000))
		self.assertFalse(de_minimis_ok(60_000, 1_000_000))

	def test_tax_on_non_qualifying_share_only(self):
		# 4% NQ is within de minimis (5%). 200k taxable × 4% × 9% = 720.
		# Standard regime would be 0 (200k is inside the AED 375k band).
		tax, ok = qfzp_tax(200_000, 960_000, 40_000, 1_000_000)
		self.assertTrue(ok)
		self.assertEqual(tax, 720.0)

	def test_de_minimis_fail_taxes_all_at_nine(self):
		tax, ok = qfzp_tax(200_000, 800_000, 200_000, 1_000_000)
		self.assertFalse(ok)
		self.assertEqual(tax, 18000.0)

	def test_gl_income_not_on_invoices_counts_as_non_qualifying(self):
		result = compute_ct(
			"FZ Co",
			"2026-01-01",
			"2026-12-31",
			elect_sbr=0,
			elect_qfzp=1,
			settings={},
			gl={"revenue": 1_000_000, "expenses": 800_000, "accounting_profit": 200_000},
			split={
				"qualifying_revenue": 960_000,
				"non_qualifying_revenue": 0,
				"unclassified_revenue": 0,
			},
			prior=0,
		)
		self.assertEqual(result["unclassified_revenue"], 40_000.0)
		self.assertEqual(result["non_qualifying_revenue"], 40_000.0)
		self.assertEqual(result["tax_payable"], 720.0)

	def test_no_375k_band_for_qfzp(self):
		result = compute_ct(
			"FZ Co",
			"2026-01-01",
			"2026-12-31",
			elect_sbr=0,
			elect_qfzp=1,
			settings={},
			gl={"revenue": 1_000_000, "expenses": 800_000, "accounting_profit": 200_000},
			split={
				"qualifying_revenue": 960_000,
				"non_qualifying_revenue": 40_000,
				"unclassified_revenue": 0,
			},
			prior=0,
		)
		self.assertEqual(result["regime"], "QFZP")
		self.assertEqual(result["tax_payable"], 720.0)


class TestDueDate(unittest.TestCase):
	def test_nine_months_after_period_end(self):
		self.assertEqual(str(filing_due_date("2025-12-31")), "2026-09-30")

	def test_deadline_status(self):
		self.assertEqual(filing_deadline_status("2026-09-30", 1, today="2026-10-01"), "Filed")
		self.assertEqual(filing_deadline_status("2026-09-30", 0, today="2026-10-01"), "Overdue")
		self.assertEqual(filing_deadline_status("2026-09-30", 0, today="2026-09-15", lead_days=30), "Due")
		self.assertEqual(filing_deadline_status("2026-09-30", 0, today="2026-01-01", lead_days=30), "Upcoming")


class TestAdjustmentsInCompute(unittest.TestCase):
	def test_add_backs_flow_into_taxable(self):
		result = compute_ct(
			"Test Co",
			"2026-01-01",
			"2026-12-31",
			adjustments=[
				{"adjustment_type": "Add-back", "amount": 50_000},
				{"adjustment_type": "Deduction", "amount": 10_000},
			],
			elect_sbr=0,
			elect_qfzp=0,
			settings={},
			gl={"revenue": 500_000, "expenses": 100_000, "accounting_profit": 400_000},
			split={"qualifying_revenue": 0, "non_qualifying_revenue": 0, "unclassified_revenue": 0},
			prior=0,
		)
		self.assertEqual(result["taxable_profit"], 440_000.0)
		self.assertEqual(result["tax_payable"], 5_850.0)


class TestGLBridge(unittest.TestCase):
	def test_period_close_and_opening_are_excluded(self):
		src = inspect.getsource(fetch_gl_totals)
		self.assertIn("Period Closing Voucher", src)
		self.assertIn("is_opening", src)


class TestQfzpShareCap(unittest.TestCase):
	def test_nq_share_cannot_exceed_taxable(self):
		# Wide de minimis so the weight cap is what we test, not the fail-all path.
		tax, ok = qfzp_tax(100_000, 0, 2_000_000, 1_000_000, percent=300, cap=10_000_000)
		self.assertTrue(ok)
		self.assertEqual(tax, 9_000.0)


class TestMutualExclusion(unittest.TestCase):
	def test_sbr_and_qfzp_cannot_combine(self):
		with self.assertRaises(Exception):
			compute_ct(
				"X",
				"2026-01-01",
				"2026-12-31",
				elect_sbr=1,
				elect_qfzp=1,
				settings={},
				gl={"revenue": 1, "expenses": 0, "accounting_profit": 1},
				split={"qualifying_revenue": 0, "non_qualifying_revenue": 0, "unclassified_revenue": 0},
				prior=0,
			)
