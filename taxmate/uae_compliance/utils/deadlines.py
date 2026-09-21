"""Pure deadline/status arithmetic for the UAE UBO & ESR tracker.

Kept free of ``frappe.db`` calls so it can be unit tested directly (see
``tests/test_uae_compliance.py``) the same way ``uae_vat.utils.vat_201``
separates ``compute_totals`` from its DB-querying box fetchers.
"""

from __future__ import annotations

import datetime

from taxmate.uae_compliance.constants import (
	ESR_STATUS_COMPLETE,
	ESR_STATUS_NOT_STARTED,
	ESR_STATUS_NOTIFICATION_DUE,
	ESR_STATUS_NOTIFICATION_FILED,
	ESR_STATUS_OVERDUE,
	ESR_STATUS_REPORT_DUE,
	UBO_STATUS_COMPLIANT,
	UBO_STATUS_OVERDUE,
	UBO_STATUS_UPDATE_DUE,
)

Date = datetime.date


def add_days(base: Date, days: int) -> Date:
	return base + datetime.timedelta(days=days)


def add_months(base: Date, months: int) -> Date:
	"""Add calendar months to a date, clamping the day to the target month's length."""
	month_index = base.month - 1 + months
	year = base.year + month_index // 12
	month = month_index % 12 + 1
	day = base.day
	# Clamp (e.g. 31 Jan + 1 month -> 28/29 Feb, not an overflow into March)
	while True:
		try:
			return base.replace(year=year, month=month, day=day)
		except ValueError:
			day -= 1


# ----------------------------------------------------------------------
# UBO change reporting (the "15-day rule")
# ----------------------------------------------------------------------


def ubo_change_reporting_deadline(change_date: Date, deadline_days: int) -> Date:
	return add_days(change_date, deadline_days)


def ubo_change_status(
	change_date: Date,
	reported_on: Date | None,
	deadline_days: int,
	today: Date,
) -> str:
	"""Status of a single UBO Change Log row.

	Reported on/before the deadline -> Compliant, even after the fact.
	Not yet reported and the deadline hasn't passed -> Update Reporting Due.
	Not yet reported and the deadline has passed -> Overdue.
	"""
	deadline = ubo_change_reporting_deadline(change_date, deadline_days)
	if reported_on is not None:
		return UBO_STATUS_COMPLIANT if reported_on <= deadline else UBO_STATUS_OVERDUE
	return UBO_STATUS_OVERDUE if today > deadline else UBO_STATUS_UPDATE_DUE


def ubo_register_status(change_statuses: list[str]) -> str:
	"""Roll up a register's overall status from its change-log rows.

	Overdue beats Update Due beats Compliant; an empty register (no
	changes logged yet, e.g. brand new) is Compliant by default.
	"""
	if not change_statuses:
		return UBO_STATUS_COMPLIANT
	if UBO_STATUS_OVERDUE in change_statuses:
		return UBO_STATUS_OVERDUE
	if UBO_STATUS_UPDATE_DUE in change_statuses:
		return UBO_STATUS_UPDATE_DUE
	return UBO_STATUS_COMPLIANT


# ----------------------------------------------------------------------
# ESR notification / report deadlines
# ----------------------------------------------------------------------


def esr_notification_due_date(financial_year_end: Date, notification_deadline_months: int) -> Date:
	return add_months(financial_year_end, notification_deadline_months)


def esr_report_due_date(financial_year_end: Date, report_deadline_months: int) -> Date:
	return add_months(financial_year_end, report_deadline_months)


def esr_filing_status(
	is_exempt: bool,
	notification_due: Date,
	notification_filed_on: Date | None,
	report_due: Date,
	report_filed_on: Date | None,
	today: Date,
	reminder_window_days: int = 30,
) -> str:
	"""Overall status for a UAE ESR Filing record.

	An exempt entity only needs the notification filed (no substance
	report is required once exemption is declared and accepted).
	``reminder_window_days`` controls when a not-yet-due filing switches
	from "Not Started" to an actionable "... Due" status -- otherwise a
	filing due in 11 months would be indistinguishable from one due
	tomorrow until the exact due date.
	"""
	if not notification_filed_on:
		if today > notification_due:
			return ESR_STATUS_OVERDUE
		if (notification_due - today).days <= reminder_window_days:
			return ESR_STATUS_NOTIFICATION_DUE
		return ESR_STATUS_NOT_STARTED

	if is_exempt:
		return ESR_STATUS_COMPLETE

	if not report_filed_on:
		if today > report_due:
			return ESR_STATUS_OVERDUE
		if (report_due - today).days <= reminder_window_days:
			return ESR_STATUS_REPORT_DUE
		return ESR_STATUS_NOTIFICATION_FILED

	return ESR_STATUS_COMPLETE
