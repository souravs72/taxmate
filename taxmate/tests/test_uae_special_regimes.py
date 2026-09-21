"""Unit tests for UAE excise / capital goods / bad-debt / margin helpers."""

import datetime
import unittest

from taxmate.uae_vat.utils.special_regimes import (
	bad_debt_eligible,
	capital_adjustment_years,
	capital_goods_annual_adjustment,
	excise_tax,
	margin_amount,
	margin_vat,
	merge_emirate_rows,
)


def d(year, month, day):
	return datetime.date(year, month, day)


class TestExcise(unittest.TestCase):
	def test_fifty_percent_on_drinks(self):
		self.assertEqual(excise_tax(1000, 50), 500)

	def test_hundred_percent_tobacco(self):
		self.assertEqual(excise_tax(250, 100), 250)

	def test_missing_rate_is_error(self):
		with self.assertRaises(ValueError):
			excise_tax(100, None)


class TestCapitalGoods(unittest.TestCase):
	def test_immovable_is_ten_years(self):
		self.assertEqual(capital_adjustment_years("Immovable"), 10)
		self.assertEqual(capital_adjustment_years("Other"), 5)

	def test_higher_use_increases_recovery(self):
		# 500_000 / 5 x (80-60)/100 = 20_000
		self.assertEqual(capital_goods_annual_adjustment(500_000, 5, 60, 80), 20_000)

	def test_lower_use_is_clawback(self):
		self.assertEqual(capital_goods_annual_adjustment(500_000, 5, 80, 60), -20_000)

	def test_zero_years_is_zero(self):
		self.assertEqual(capital_goods_annual_adjustment(100, 0, 50, 80), 0)

	def test_adjustment_window(self):
		from taxmate.uae_vat.utils.special_regimes import capital_goods_period_in_window

		self.assertTrue(capital_goods_period_in_window(d(2026, 1, 1), 5, d(2030, 12, 31)))
		self.assertTrue(capital_goods_period_in_window(d(2026, 1, 1), 5, d(2031, 1, 1)))
		self.assertFalse(capital_goods_period_in_window(d(2026, 1, 1), 5, d(2031, 1, 2)))
		self.assertFalse(capital_goods_period_in_window(d(2026, 1, 1), 5, d(2025, 12, 31)))
		self.assertFalse(capital_goods_period_in_window(d(2026, 1, 1), 0, d(2026, 6, 1)))


class TestBadDebt(unittest.TestCase):
	def test_too_early(self):
		self.assertFalse(bad_debt_eligible(d(2026, 1, 1), d(2026, 4, 1)))

	def test_on_six_months(self):
		self.assertTrue(bad_debt_eligible(d(2026, 1, 1), d(2026, 7, 1)))

	def test_missing_dates(self):
		self.assertFalse(bad_debt_eligible(None, d(2026, 7, 1)))


class TestMargin(unittest.TestCase):
	def test_margin_and_vat(self):
		self.assertEqual(margin_amount(1000, 700), 300)
		self.assertEqual(margin_vat(300), 15)

	def test_loss_is_zero_margin(self):
		self.assertEqual(margin_amount(500, 700), 0)

	def test_credit_note_reverses_margin(self):
		self.assertEqual(margin_amount(-1000, 700), -300)
		self.assertEqual(margin_vat(-300), -15)

	def test_credit_note_loss_stays_zero(self):
		self.assertEqual(margin_amount(-500, 700), 0)

	def test_merge_emirate_rows(self):
		base = [{"emirate": "Dubai", "amount": 100, "vat_amount": 5}]
		extra = [{"emirate": "Dubai", "amount": 20, "vat_amount": 1}]
		merged = merge_emirate_rows(base, extra)
		self.assertEqual(merged[0]["amount"], 120)
		self.assertEqual(merged[0]["vat_amount"], 6)


if __name__ == "__main__":
	unittest.main()
