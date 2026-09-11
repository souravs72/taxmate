"""Unit tests for UAE UBO / ESR deadline arithmetic (pure functions, no fixtures).

Run: bench --site <site> run-tests --module taxmate.tests.test_uae_compliance

Only ``taxmate.uae_compliance.utils.deadlines`` is tested here -- the
doctype controllers query the database (UAE Compliance Settings, Company)
and need a live site with fixtures for a meaningful integration test.
"""

import datetime
import unittest

from taxmate.uae_compliance.constants import (
	ESR_STATUS_COMPLETE,
	ESR_STATUS_NOTIFICATION_DUE,
	ESR_STATUS_NOTIFICATION_FILED,
	ESR_STATUS_NOT_STARTED,
	ESR_STATUS_OVERDUE,
	ESR_STATUS_REPORT_DUE,
	UBO_STATUS_COMPLIANT,
	UBO_STATUS_OVERDUE,
	UBO_STATUS_UPDATE_DUE,
)
from taxmate.uae_compliance.utils.deadlines import (
	add_months,
	esr_filing_status,
	esr_notification_due_date,
	esr_report_due_date,
	ubo_change_reporting_deadline,
	ubo_change_status,
	ubo_register_status,
)


def d(year, month, day):
	return datetime.date(year, month, day)


class TestAddMonths(unittest.TestCase):
	def test_simple_case(self):
		self.assertEqual(add_months(d(2026, 1, 15), 6), d(2026, 7, 15))

	def test_crosses_year_boundary(self):
		self.assertEqual(add_months(d(2026, 9, 30), 6), d(2027, 3, 30))

	def test_clamps_to_shorter_month(self):
		# 31 Jan + 1 month must land in February, not overflow into March
		self.assertEqual(add_months(d(2026, 1, 31), 1), d(2026, 2, 28))

	def test_clamps_on_leap_year(self):
		self.assertEqual(add_months(d(2028, 1, 31), 1), d(2028, 2, 29))

	def test_twelve_months(self):
		self.assertEqual(add_months(d(2026, 3, 31), 12), d(2027, 3, 31))


class TestUBOChangeDeadline(unittest.TestCase):
	def test_deadline_is_change_date_plus_window(self):
		self.assertEqual(ubo_change_reporting_deadline(d(2026, 1, 1), 15), d(2026, 1, 16))

	def test_reported_before_deadline_is_compliant(self):
		status = ubo_change_status(
			change_date=d(2026, 1, 1), reported_on=d(2026, 1, 10), deadline_days=15, today=d(2026, 1, 20)
		)
		self.assertEqual(status, UBO_STATUS_COMPLIANT)

	def test_reported_on_exact_deadline_is_compliant(self):
		status = ubo_change_status(
			change_date=d(2026, 1, 1), reported_on=d(2026, 1, 16), deadline_days=15, today=d(2026, 1, 20)
		)
		self.assertEqual(status, UBO_STATUS_COMPLIANT)

	def test_reported_after_deadline_is_overdue_even_though_reported(self):
		status = ubo_change_status(
			change_date=d(2026, 1, 1), reported_on=d(2026, 1, 20), deadline_days=15, today=d(2026, 1, 25)
		)
		self.assertEqual(status, UBO_STATUS_OVERDUE)

	def test_not_reported_within_window_is_update_due(self):
		status = ubo_change_status(
			change_date=d(2026, 1, 1), reported_on=None, deadline_days=15, today=d(2026, 1, 10)
		)
		self.assertEqual(status, UBO_STATUS_UPDATE_DUE)

	def test_not_reported_past_window_is_overdue(self):
		status = ubo_change_status(
			change_date=d(2026, 1, 1), reported_on=None, deadline_days=15, today=d(2026, 1, 17)
		)
		self.assertEqual(status, UBO_STATUS_OVERDUE)


class TestUBORegisterRollup(unittest.TestCase):
	def test_empty_log_is_compliant(self):
		self.assertEqual(ubo_register_status([]), UBO_STATUS_COMPLIANT)

	def test_overdue_beats_everything(self):
		statuses = [UBO_STATUS_COMPLIANT, UBO_STATUS_UPDATE_DUE, UBO_STATUS_OVERDUE]
		self.assertEqual(ubo_register_status(statuses), UBO_STATUS_OVERDUE)

	def test_update_due_beats_compliant(self):
		statuses = [UBO_STATUS_COMPLIANT, UBO_STATUS_UPDATE_DUE]
		self.assertEqual(ubo_register_status(statuses), UBO_STATUS_UPDATE_DUE)

	def test_all_compliant_is_compliant(self):
		statuses = [UBO_STATUS_COMPLIANT, UBO_STATUS_COMPLIANT]
		self.assertEqual(ubo_register_status(statuses), UBO_STATUS_COMPLIANT)


class TestESRDueDates(unittest.TestCase):
	def test_notification_due_date_default_six_months(self):
		self.assertEqual(esr_notification_due_date(d(2026, 12, 31), 6), d(2027, 6, 30))

	def test_report_due_date_default_twelve_months(self):
		self.assertEqual(esr_report_due_date(d(2026, 12, 31), 12), d(2027, 12, 31))


class TestESRFilingStatus(unittest.TestCase):
	def test_far_from_notification_deadline_is_not_started(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=None,
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2026, 9, 10),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_NOT_STARTED)

	def test_within_reminder_window_is_notification_due(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=None,
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2027, 6, 10),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_NOTIFICATION_DUE)

	def test_past_notification_deadline_unfiled_is_overdue(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=None,
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2027, 7, 1),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_OVERDUE)

	def test_exempt_entity_complete_after_notification_alone(self):
		status = esr_filing_status(
			is_exempt=True,
			notification_due=d(2027, 6, 30),
			notification_filed_on=d(2027, 6, 15),
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2027, 7, 1),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_COMPLETE)

	def test_non_exempt_after_notification_before_report_window_is_notification_filed(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=d(2027, 6, 15),
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2027, 8, 1),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_NOTIFICATION_FILED)

	def test_non_exempt_within_report_window_is_report_due(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=d(2027, 6, 15),
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2027, 12, 5),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_REPORT_DUE)

	def test_non_exempt_past_report_deadline_unfiled_is_overdue(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=d(2027, 6, 15),
			report_due=d(2027, 12, 31),
			report_filed_on=None,
			today=d(2028, 1, 1),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_OVERDUE)

	def test_both_filed_is_complete(self):
		status = esr_filing_status(
			is_exempt=False,
			notification_due=d(2027, 6, 30),
			notification_filed_on=d(2027, 6, 15),
			report_due=d(2027, 12, 31),
			report_filed_on=d(2027, 12, 20),
			today=d(2028, 1, 1),
			reminder_window_days=30,
		)
		self.assertEqual(status, ESR_STATUS_COMPLETE)


if __name__ == "__main__":
	unittest.main()
