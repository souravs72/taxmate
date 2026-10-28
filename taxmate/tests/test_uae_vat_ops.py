"""Unit tests for Phase 1 VAT operations helpers (no site fixtures)."""

import unittest

from taxmate.uae_vat.utils.place_of_supply import (
	designated_zone_fz_guidance,
	designated_zone_guidance,
	expected_vat_category,
	is_simplified_tax_invoice,
)
from taxmate.uae_vat.utils.recoverability import (
	_line_uae_vat,
	line_vat_in_aed,
	recoverable_vat_from_items,
	recovery_percent_for_template,
	standard_rated_vat,
)
from taxmate.uae_vat.utils.vat_201 import include_in_box_9


class TestRecoverability(unittest.TestCase):
	def test_standard_rated_vat_ignores_item_tax_amount(self):
		from inspect import getsource

		from taxmate.uae_vat.utils.recoverability import apply_box_9_recoverable

		src = getsource(apply_box_9_recoverable)
		self.assertNotIn('get("tax_amount")', src)
		self.assertIn("_line_uae_vat", src)

	def test_excise_is_not_standard_rated_vat(self):
		doc = {
			"items": [{"name": "ROW-1"}],
			"taxes": [
				{"name": "TAX-EX", "account_head": "Excise 100% - CO"},
				{"name": "TAX-VAT", "account_head": "VAT 5% - CO"},
			],
			"item_wise_tax_details": [
				{"item_row": "ROW-1", "tax_row": "TAX-EX", "amount": 3120},
				{"item_row": "ROW-1", "tax_row": "TAX-VAT", "amount": 156},
			],
		}
		self.assertEqual(_line_uae_vat(doc, {"VAT 5% - CO"}), [156.0])
		self.assertEqual(recoverable_vat_from_items([156.0], [100.0]), 156.0)
		# Stored recoverable still holds the old excise figure.
		self.assertEqual(standard_rated_vat(3120, 156), 156)
		# A stored figure at or under the VAT account total is kept.
		self.assertEqual(standard_rated_vat(78, 156), 78)
		# No VAT account tax, so an excise-only invoice stays out of box 9.
		self.assertEqual(standard_rated_vat(3120, 0), 0)
		# A manual figure is the operator's number.
		self.assertEqual(standard_rated_vat(3120, 156, manual=True), 3120)

	def test_default_full_recovery(self):
		self.assertEqual(recovery_percent_for_template(None), 100.0)
		self.assertEqual(recovery_percent_for_template({}), 100.0)

	def test_blocked_is_zero(self):
		self.assertEqual(recovery_percent_for_template({"uae_blocked_input_tax": 1}), 0.0)

	def test_block_reason_is_zero(self):
		self.assertEqual(recovery_percent_for_template({"uae_input_tax_block_reason": "Entertainment"}), 0.0)

	def test_partial_percent(self):
		self.assertEqual(recovery_percent_for_template({"uae_input_tax_recovery_percent": 50}), 50.0)

	def test_mixed_rates_use_item_vat_not_net(self):
		# 1000@0% + 100@5% blocked must be 0, not ~4.55 from net-weighting
		self.assertEqual(recoverable_vat_from_items([0, 5], [100, 0], header_vat=5), 0.0)

	def test_partial_on_item_vat(self):
		self.assertEqual(recoverable_vat_from_items([50, 50], [100, 0]), 50.0)

	def test_all_blocked(self):
		self.assertEqual(recoverable_vat_from_items([40, 40], [0, 0]), 0.0)

	def test_credit_note_negative_vat(self):
		self.assertEqual(recoverable_vat_from_items([-5], [100]), -5.0)

	def test_length_mismatch_raises(self):
		with self.assertRaises(ValueError):
			recoverable_vat_from_items([10], [100, 50])

	def test_line_vat_converted_to_aed(self):
		self.assertEqual(line_vat_in_aed(10, 3.67), 36.7)


class TestDesignatedZone(unittest.TestCase):
	def test_no_guidance_unless_both_in_zone_with_goods(self):
		self.assertIsNone(designated_zone_guidance(True, False, True))
		self.assertIsNone(designated_zone_guidance(True, True, False))

	def test_guidance_when_in_zone_goods(self):
		self.assertIsNotNone(designated_zone_guidance(True, True, True))

	def test_expected_out_of_scope_for_dz_goods(self):
		self.assertEqual(expected_vat_category(True, True, "Goods"), "Out of Scope")
		self.assertIsNone(expected_vat_category(True, True, "Service"))
		self.assertIsNone(expected_vat_category(True, False, "Goods"))

	def test_fz_guidance_names_the_buyer(self):
		hint = designated_zone_fz_guidance("Customer", None)
		self.assertIsNotNone(hint)
		self.assertIn("Customer", hint)
		self.assertIn("IBR-007-ae", hint)
		self.assertIsNone(designated_zone_fz_guidance("Company", "FZ-1"))
		self.assertIn("Company", designated_zone_fz_guidance("Company", "") or "")


class TestSimplifiedInvoice(unittest.TestCase):
	def test_b2b_is_never_simplified(self):
		self.assertFalse(is_simplified_tax_invoice(True, 100))

	def test_b2c_under_threshold(self):
		self.assertTrue(is_simplified_tax_invoice(False, 10000))

	def test_b2c_over_threshold(self):
		self.assertFalse(is_simplified_tax_invoice(False, 10000.01))


class TestBox9Filter(unittest.TestCase):
	def test_desk_includes_only_positive_recoverable(self):
		self.assertFalse(include_in_box_9(-12.5))
		self.assertTrue(include_in_box_9(8))
		self.assertFalse(include_in_box_9(0))
