"""Status rules and VAT period maths — pure, no site needed.

``taxmate.utils.client_status`` imports no frappe, so this runs either way:

    bench --site taxmate.site run-tests --module taxmate.tests.test_client_status
    python -m unittest taxmate.tests.test_client_status      # no bench, no site
"""

from __future__ import annotations

import unittest
from datetime import date, timedelta
from typing import ClassVar

from taxmate.utils.client_status import (
	AGE_BUCKETS,
	BANK_LINES_PILING,
	CLOSE_LATE_DAYS,
	FIXES_PILING,
	STATUS_DUE_SOON,
	STATUS_ON_TRACK,
	STATUS_OVERDUE,
	TILES,
	add_months,
	client_status,
	current_vat_period,
	overdue_total,
	sixty_plus_total,
	vat_due_date,
)

D = date
TODAY = D(2026, 10, 6)


class TestDateMaths(unittest.TestCase):
	def test_add_months_clamps_to_month_length(self):
		self.assertEqual(add_months(D(2026, 1, 31), 1), D(2026, 2, 28))
		self.assertEqual(add_months(D(2028, 1, 31), 1), D(2028, 2, 29))  # leap

	def test_add_months_rolls_the_year(self):
		self.assertEqual(add_months(D(2026, 11, 1), 3), D(2027, 2, 1))
		self.assertEqual(add_months(D(2026, 2, 1), -3), D(2025, 11, 1))

	def test_vat_due_is_28th_of_the_following_month(self):
		self.assertEqual(vat_due_date(D(2026, 9, 30)), D(2026, 10, 28))
		self.assertEqual(vat_due_date(D(2026, 2, 28)), D(2026, 3, 28))

	def test_vat_due_crosses_the_year(self):
		self.assertEqual(vat_due_date(D(2026, 12, 31)), D(2027, 1, 28))


class TestVatPeriod(unittest.TestCase):
	def test_monthly_is_the_month_that_just_ended(self):
		p = current_vat_period("Monthly", None, TODAY)
		self.assertEqual((p.start, p.end, p.due), (D(2026, 9, 1), D(2026, 9, 30), D(2026, 10, 28)))

	def test_monthly_on_the_first_of_a_month(self):
		p = current_vat_period("Monthly", D(2026, 1, 1), D(2027, 1, 1))
		self.assertEqual((p.start, p.end, p.due), (D(2026, 12, 1), D(2026, 12, 31), D(2027, 1, 28)))

	def test_quarterly_aligned_to_the_calendar(self):
		p = current_vat_period("Quarterly", D(2026, 1, 1), TODAY)
		self.assertEqual((p.start, p.end, p.due), (D(2026, 7, 1), D(2026, 9, 30), D(2026, 10, 28)))

	def test_quarterly_respects_the_stagger(self):
		# Anchored on 1 Feb: Feb-Apr, May-Jul, Aug-Oct. On 6 Oct the latest
		# period to have fully ended is May-Jul, not the one we are inside.
		p = current_vat_period("Quarterly", D(2026, 2, 1), TODAY)
		self.assertEqual((p.start, p.end, p.due), (D(2026, 5, 1), D(2026, 7, 31), D(2026, 8, 28)))

	def test_quarterly_on_the_day_a_period_ends(self):
		p = current_vat_period("Quarterly", D(2026, 1, 1), D(2026, 9, 30))
		self.assertEqual((p.start, p.end), (D(2026, 7, 1), D(2026, 9, 30)))

	def test_no_period_before_the_first_one_has_ended(self):
		self.assertIsNone(current_vat_period("Quarterly", D(2026, 9, 1), TODAY))
		self.assertIsNone(current_vat_period("Quarterly", D(2027, 1, 1), TODAY))

	def test_unset_frequency_or_stagger_gives_nothing(self):
		self.assertIsNone(current_vat_period(None, D(2026, 1, 1), TODAY))
		self.assertIsNone(current_vat_period("", D(2026, 1, 1), TODAY))
		self.assertIsNone(current_vat_period("Quarterly", None, TODAY))
		self.assertIsNone(current_vat_period("Annually", D(2026, 1, 1), TODAY))

	def test_quarterly_never_returns_a_period_that_has_not_ended(self):
		for anchor_month in range(1, 13):
			for day in (1, 15, 28):
				on = D(2026, anchor_month, day)
				p = current_vat_period("Quarterly", D(2025, 1, 1), on)
				self.assertIsNotNone(p)
				self.assertLessEqual(p.end, on, f"period ends after {on}")
				self.assertEqual((p.end - p.start).days + 1 > 85, True)


class TestStatus(unittest.TestCase):
	def test_overdue_vat(self):
		s = client_status(on=TODAY, vat_days=-8)
		self.assertEqual((s.status, s.reason_key), (STATUS_OVERDUE, "vat_overdue"))
		self.assertEqual(s.reason["days"], 8)

	def test_a_filed_return_is_not_overdue_even_past_its_date(self):
		s = client_status(on=TODAY, vat_days=-8, vat_filed=True)
		self.assertEqual(s.status, STATUS_ON_TRACK)

	def test_rejected_e_invoice_is_overdue(self):
		s = client_status(on=TODAY, einvoice_rejected=2)
		self.assertEqual((s.status, s.reason_key), (STATUS_OVERDUE, "einvoice_rejected"))

	def test_overdue_vat_outranks_a_rejected_e_invoice(self):
		s = client_status(on=TODAY, vat_days=-1, einvoice_rejected=5)
		self.assertEqual(s.reason_key, "vat_overdue")

	def test_month_open_too_long_is_overdue_at_the_boundary(self):
		end = TODAY - timedelta(days=CLOSE_LATE_DAYS)  # exactly CLOSE_LATE_DAYS ago
		s = client_status(on=TODAY, close_done=5, close_total=8, close_month_end=end)
		self.assertEqual((s.status, s.reason_key), (STATUS_OVERDUE, "close_late"))
		self.assertEqual(s.reason["days"], CLOSE_LATE_DAYS)

	def test_month_open_one_day_short_is_not_overdue(self):
		end = TODAY - timedelta(days=CLOSE_LATE_DAYS - 1)
		s = client_status(on=TODAY, close_done=5, close_total=8, close_month_end=end)
		self.assertNotEqual(s.status, STATUS_OVERDUE)

	def test_a_closed_month_never_triggers_close_late(self):
		s = client_status(on=TODAY, close_done=8, close_total=8, close_month_end=D(2026, 1, 31))
		self.assertEqual(s.status, STATUS_ON_TRACK)

	def test_vat_due_soon_at_the_boundary(self):
		self.assertEqual(client_status(on=TODAY, vat_days=14).reason_key, "vat_due_soon")
		self.assertEqual(client_status(on=TODAY, vat_days=15).status, STATUS_ON_TRACK)

	def test_not_e_invoicing_ready_is_due_soon(self):
		s = client_status(on=TODAY, einvoice_done=8, einvoice_total=10)
		self.assertEqual((s.status, s.reason_key), (STATUS_DUE_SOON, "einvoice_not_ready"))
		self.assertEqual(s.reason, {"done": 8, "total": 10})

	def test_fully_ready_is_not_flagged(self):
		s = client_status(on=TODAY, einvoice_done=10, einvoice_total=10)
		self.assertEqual(s.status, STATUS_ON_TRACK)

	def test_bank_backlog_at_the_boundary(self):
		self.assertEqual(
			client_status(on=TODAY, bank_unreconciled=BANK_LINES_PILING).reason_key, "bank_backlog"
		)
		self.assertEqual(
			client_status(on=TODAY, bank_unreconciled=BANK_LINES_PILING - 1).status, STATUS_ON_TRACK
		)

	def test_fixes_backlog_at_the_boundary(self):
		self.assertEqual(client_status(on=TODAY, fixes_count=FIXES_PILING).reason_key, "fixes_backlog")
		self.assertEqual(client_status(on=TODAY, fixes_count=FIXES_PILING - 1).status, STATUS_ON_TRACK)

	def test_nothing_known_is_on_track_not_a_crash(self):
		s = client_status(on=TODAY)
		self.assertEqual((s.status, s.reason_key), (STATUS_ON_TRACK, "nothing_due"))

	def test_unknown_signals_never_trigger_a_status(self):
		# None means "could not be read", not zero and not a large number.
		s = client_status(
			on=TODAY,
			vat_days=None,
			einvoice_rejected=None,
			einvoice_done=None,
			einvoice_total=None,
			close_done=None,
			close_total=None,
			bank_unreconciled=None,
			fixes_count=None,
		)
		self.assertEqual(s.status, STATUS_ON_TRACK)

	def test_zero_rejections_is_not_a_rejection(self):
		self.assertEqual(client_status(on=TODAY, einvoice_rejected=0).status, STATUS_ON_TRACK)

	def test_every_status_is_one_of_the_three(self):
		for kwargs in (
			{"vat_days": -1},
			{"vat_days": 3},
			{"bank_unreconciled": 99},
			{"einvoice_rejected": 1},
			{},
		):
			s = client_status(on=TODAY, **kwargs)
			self.assertIn(s.status, (STATUS_OVERDUE, STATUS_DUE_SOON, STATUS_ON_TRACK))
			self.assertTrue(s.reason_key)
			self.assertIsInstance(s.reason, dict)


class TestAgeing(unittest.TestCase):
	# current, 1_30, 31_60, 61_90, 90_plus
	BUCKETS: ClassVar[list[float]] = [1000.0, 200.0, 300.0, 400.0, 500.0]

	def test_bucket_names_have_not_drifted(self):
		self.assertEqual(AGE_BUCKETS, ("current", "1_30", "31_60", "61_90", "90_plus"))

	def test_overdue_excludes_current(self):
		self.assertEqual(overdue_total(self.BUCKETS), 1400.0)

	def test_sixty_plus_is_the_last_two_buckets(self):
		self.assertEqual(sixty_plus_total(self.BUCKETS), 900.0)

	def test_sixty_plus_never_exceeds_overdue(self):
		self.assertLessEqual(sixty_plus_total(self.BUCKETS), overdue_total(self.BUCKETS))

	def test_missing_buckets_are_unknown_not_zero(self):
		self.assertIsNone(overdue_total(None))
		self.assertIsNone(sixty_plus_total(None))
		self.assertIsNone(overdue_total([]))


class TestTilePredicates(unittest.TestCase):
	def test_an_empty_row_matches_no_tile(self):
		for key, fn in TILES.items():
			self.assertFalse(fn({}), f"{key} matched an empty row")

	def test_a_row_of_unknowns_matches_no_tile(self):
		row = {
			"vat": {"days": None, "filed": False},
			"bank": {"unreconciled": None},
			"einvoice": {"done": None, "total": None},
			"receivable": {"overdue": None},
			"close": {"done": None, "total": None},
		}
		for key, fn in TILES.items():
			self.assertFalse(fn(row), f"{key} matched an unknown row")

	def test_each_tile_matches_its_own_signal(self):
		self.assertTrue(TILES["vat"]({"vat": {"days": 3, "filed": False}}))
		self.assertFalse(TILES["vat"]({"vat": {"days": 3, "filed": True}}))
		self.assertTrue(TILES["bank"]({"bank": {"unreconciled": 1}}))
		self.assertFalse(TILES["bank"]({"bank": {"unreconciled": 0}}))
		self.assertTrue(TILES["einvoice"]({"einvoice": {"done": 9, "total": 10}}))
		self.assertFalse(TILES["einvoice"]({"einvoice": {"done": 10, "total": 10}}))
		self.assertTrue(TILES["receivables"]({"receivable": {"overdue": 1.0}}))
		self.assertFalse(TILES["receivables"]({"receivable": {"overdue": 0}}))
		self.assertTrue(TILES["close"]({"close": {"done": 4, "total": 8}}))
		self.assertFalse(TILES["close"]({"close": {"done": 8, "total": 8}}))

	def test_the_vat_tile_agrees_with_the_due_soon_rule(self):
		# Both read the same threshold; if one is edited the other must follow.
		for days in (-5, 0, 14):
			self.assertTrue(TILES["vat"]({"vat": {"days": days, "filed": False}}))
		self.assertFalse(TILES["vat"]({"vat": {"days": 15, "filed": False}}))


if __name__ == "__main__":
	unittest.main()
