"""Unit tests for VAT 201 box arithmetic (pure functions, no fixtures).

Run: bench --site <site> run-tests --module taxmate.tests.test_uae_vat_201

Only ``compute_totals`` is tested here -- it is pure arithmetic. The ledger
fetchers in ``taxmate.uae_vat.utils.vat_201`` (Boxes 1-5, 9-10) query the
database directly and need a live site with Sales/Purchase Invoice fixtures
to test meaningfully; that is left for an integration test against a real
bench site rather than faked here.
"""

import unittest

from taxmate.uae_vat.utils.vat_201 import (
	BOX_1_EXCLUDED_CATEGORIES,
	VAT_201_EMIRATE_ORDER,
	compute_totals,
	filing_deadline_status,
)


class TestComputeTotals(unittest.TestCase):
	def test_simple_output_only(self):
		"""Box 8 = Box 1 VAT when there's no RCM, imports, or tourist refund."""
		totals = compute_totals(
			box_1_vat_amount=500,
			box_2_vat_amount=0,
			box_3_vat_amount=0,
			box_6_vat_amount=0,
			box_7_vat_amount=0,
			box_9_vat_amount=0,
			box_10_vat_amount=0,
		)
		self.assertEqual(totals["box_8_vat_amount"], 500)
		self.assertEqual(totals["box_11_vat_amount"], 0)
		self.assertEqual(totals["net_vat_due"], 500)

	def test_tourist_refund_reduces_output_tax(self):
		totals = compute_totals(
			box_1_vat_amount=1000,
			box_2_vat_amount=50,
			box_3_vat_amount=0,
			box_6_vat_amount=0,
			box_7_vat_amount=0,
			box_9_vat_amount=0,
			box_10_vat_amount=0,
		)
		self.assertEqual(totals["box_8_vat_amount"], 950)

	def test_reverse_charge_and_imports_add_to_output_tax(self):
		totals = compute_totals(
			box_1_vat_amount=1000,
			box_2_vat_amount=0,
			box_3_vat_amount=100,
			box_6_vat_amount=200,
			box_7_vat_amount=-20,
			box_9_vat_amount=0,
			box_10_vat_amount=0,
		)
		# 1000 + 100 + 200 - 20
		self.assertEqual(totals["box_8_vat_amount"], 1280)

	def test_recoverable_input_tax_is_boxes_9_plus_10(self):
		totals = compute_totals(
			box_1_vat_amount=0,
			box_2_vat_amount=0,
			box_3_vat_amount=0,
			box_6_vat_amount=0,
			box_7_vat_amount=0,
			box_9_vat_amount=300,
			box_10_vat_amount=75,
		)
		self.assertEqual(totals["box_11_vat_amount"], 375)
		self.assertEqual(totals["box_13_vat_amount"], 375)

	def test_net_vat_due_positive_means_payable(self):
		totals = compute_totals(
			box_1_vat_amount=1000,
			box_2_vat_amount=0,
			box_3_vat_amount=0,
			box_6_vat_amount=0,
			box_7_vat_amount=0,
			box_9_vat_amount=200,
			box_10_vat_amount=0,
		)
		self.assertEqual(totals["net_vat_due"], 800)
		self.assertGreater(totals["net_vat_due"], 0)

	def test_net_vat_due_negative_means_reclaimable(self):
		totals = compute_totals(
			box_1_vat_amount=100,
			box_2_vat_amount=0,
			box_3_vat_amount=0,
			box_6_vat_amount=0,
			box_7_vat_amount=0,
			box_9_vat_amount=900,
			box_10_vat_amount=0,
		)
		self.assertEqual(totals["net_vat_due"], -800)
		self.assertLess(totals["net_vat_due"], 0)

	def test_boxes_8_and_12_always_match(self):
		"""Box 12 just restates Box 8 in Section 3 of the real FTA form."""
		totals = compute_totals(
			box_1_vat_amount=321.55,
			box_2_vat_amount=1.05,
			box_3_vat_amount=10,
			box_6_vat_amount=5,
			box_7_vat_amount=0,
			box_9_vat_amount=40,
			box_10_vat_amount=0,
		)
		self.assertEqual(totals["box_8_vat_amount"], totals["box_12_vat_amount"])
		self.assertEqual(totals["box_11_vat_amount"], totals["box_13_vat_amount"])

	def test_rounds_to_two_decimal_places(self):
		totals = compute_totals(
			box_1_vat_amount=100.005,
			box_2_vat_amount=0,
			box_3_vat_amount=0,
			box_6_vat_amount=0,
			box_7_vat_amount=0,
			box_9_vat_amount=0,
			box_10_vat_amount=0,
		)
		# frappe.utils.flt rounds half-to-even/away per its own precision rules;
		# the key contract here is "2 decimal places", not a specific rounding mode.
		self.assertEqual(round(totals["box_8_vat_amount"], 2), totals["box_8_vat_amount"])


class TestEmirateOrder(unittest.TestCase):
	def test_matches_official_fta_form_order(self):
		"""Boxes 1a-1g must follow the printed VAT 201 order, not alphabetical."""
		self.assertEqual(
			VAT_201_EMIRATE_ORDER,
			("Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"),
		)

	def test_seven_emirates_no_duplicates(self):
		self.assertEqual(len(VAT_201_EMIRATE_ORDER), 7)
		self.assertEqual(len(set(VAT_201_EMIRATE_ORDER)), 7)


class TestDeadlineStatus(unittest.TestCase):
	def test_filed_wins(self):
		self.assertEqual(filing_deadline_status("2026-01-28", 1, today="2026-02-01"), "Filed")

	def test_overdue(self):
		self.assertEqual(filing_deadline_status("2026-01-28", 0, today="2026-01-29"), "Overdue")

	def test_due_inside_lead(self):
		self.assertEqual(filing_deadline_status("2026-01-28", 0, today="2026-01-22"), "Due")

	def test_upcoming(self):
		self.assertEqual(filing_deadline_status("2026-01-28", 0, today="2026-01-01"), "Upcoming")

	def test_custom_lead_days(self):
		self.assertEqual(filing_deadline_status("2026-01-28", 0, today="2026-01-10", lead_days=20), "Due")
		self.assertEqual(filing_deadline_status("2026-01-28", 0, today="2026-01-10", lead_days=7), "Upcoming")


class TestBox1Categories(unittest.TestCase):
	def test_excluded_non_standard_categories(self):
		self.assertIn("Out of Scope", BOX_1_EXCLUDED_CATEGORIES)
		self.assertIn("Reverse Charge", BOX_1_EXCLUDED_CATEGORIES)


if __name__ == "__main__":
	unittest.main()
