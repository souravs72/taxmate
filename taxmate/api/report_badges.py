"""Small status badges for the Reports list.

The Reports screen is a menu, so this endpoint stays cheap: a handful of
counts and one aggregate, nothing per-row. Everything reads through
``frappe.get_list``/permission checks, so a badge the user's role cannot see
simply does not come back — it is never shown as zero.

Design: the "Reports" board in the TaxMate screens canvas.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, today

from taxmate.api.resource import assert_company_read, require_login

_VAT_LOG = "UAE VAT 201 Filing Log"
_CT_LOG = "UAE CT Filing Log"
_EINV_LOG = "UAE E-Invoice Log"
_LATE = "UAE Late Filing Notice"
_GL_EXCLUDE_VOUCHERS = ["Period Closing Voucher"]
TOLERANCE = 0.5


def _can(doctype: str) -> bool:
	return bool(frappe.db.exists("DocType", doctype) and frappe.has_permission(doctype, "read"))


@frappe.whitelist()
def get_report_badges(company: str | None = None) -> dict[str, Any]:
	"""One badge per report that has something worth saying today."""
	require_login()
	company = company or frappe.defaults.get_user_default("Company")
	if not company:
		return {"company": None, "badges": {}}
	assert_company_read(company)

	on = getdate(today())
	badges: dict[str, dict] = {}

	tb = _trial_balance(company, on)
	if tb:
		badges["Trial Balance"] = tb

	vat = _vat(company, on)
	if vat:
		badges["UAE VAT 201"] = vat

	einv = _einvoice(company)
	if einv:
		badges["UAE E-Invoice Status"] = einv

	late = _late_filings(company)
	if late:
		badges["UAE Late Filing Status"] = late

	ct = _corporate_tax(company, on)
	if ct:
		badges["UAE Corporate Tax Worksheet"] = ct

	compliance = _compliance(company)
	if compliance:
		badges["UAE Compliance Status"] = compliance

	return {"company": company, "today": str(on), "badges": badges}


def _badge(tone: str, key: str, **vars) -> dict:
	"""``tone`` drives the colour; the screen turns ``key`` into words."""
	return {"tone": tone, "key": key, **vars}


def _trial_balance(company: str, on) -> dict | None:
	if not _can("GL Entry"):
		return None
	default_fb = frappe.get_cached_value("Company", company, "default_finance_book")
	rows = frappe.get_list(
		"GL Entry",
		filters=[
			["company", "=", company],
			["is_cancelled", "=", 0],
			["voucher_type", "not in", _GL_EXCLUDE_VOUCHERS],
			["finance_book", "in", ["", default_fb] if default_fb else [""]],
			["posting_date", "<=", on],
		],
		fields=[{"SUM": "debit", "as": "dr"}, {"SUM": "credit", "as": "cr"}],
		limit=1,
	)
	if not rows:
		return None
	diff = round(flt(rows[0].dr) - flt(rows[0].cr), 2)
	if abs(diff) <= TOLERANCE:
		return _badge("ok", "balanced")
	return _badge("bad", "outBy", amount=diff)


def _vat(company: str, on) -> dict | None:
	"""The return the accountant is working on: the open one, else the next unfiled."""
	if not _can(_VAT_LOG):
		return None
	rows = frappe.get_list(
		_VAT_LOG,
		filters=[["company", "=", company], ["docstatus", "<", 2]],
		fields=["name", "period_start", "period_end", "filing_due_date", "status", "docstatus"],
		order_by="period_end desc",
		limit=6,
	)
	if not rows:
		return None
	current = next(
		(r for r in rows if r.period_start and r.period_end and getdate(r.period_start) <= on <= getdate(r.period_end)),
		None,
	)
	if current is None:
		unfiled = [r for r in rows if r.status != "Filed" and r.filing_due_date]
		current = min(unfiled, key=lambda r: getdate(r.filing_due_date)) if unfiled else rows[0]
	if cint(current.docstatus) == 1 or current.status == "Filed":
		return _badge("ok", "filed", period=_period_label(current))
	days = (getdate(current.filing_due_date) - on).days if current.filing_due_date else None
	tone = "bad" if days is not None and days < 0 else "warn"
	return _badge(tone, "draftDue", period=_period_label(current), days=days)


def _period_label(row) -> str:
	"""Q3 or a month name, whichever the period actually is."""
	if not (row.period_start and row.period_end):
		return ""
	start, end = getdate(row.period_start), getdate(row.period_end)
	months = (end.year - start.year) * 12 + end.month - start.month + 1
	# Only a period on a calendar-quarter boundary gets a Qn label: the FTA hands
	# out staggered quarters (Feb–Apr, Nov–Jan …) and those have no quarter number.
	if months == 3 and start.month in (1, 4, 7, 10):
		return f"Q{(start.month - 1) // 3 + 1}"
	if months == 1:
		return start.strftime("%b")
	return f"{start.strftime('%b')}–{end.strftime('%b')}"


def _einvoice(company: str) -> dict | None:
	if not _can(_EINV_LOG):
		return None
	rows = frappe.get_list(
		_EINV_LOG,
		filters=[["company", "=", company], ["status", "in", ["Rejected", "Failed"]]],
		fields=[{"COUNT": "*", "as": "n"}],
		limit=1,
	)
	n = cint(rows[0].n) if rows else 0
	return _badge("bad", "needAction", count=n) if n else _badge("ok", "allSent")


def _late_filings(company: str) -> dict | None:
	if not _can(_LATE):
		return None
	rows = frappe.get_list(
		_LATE,
		filters=[["company", "=", company], ["status", "in", ["Due", "Overdue"]]],
		fields=[{"COUNT": "*", "as": "n"}],
		limit=1,
	)
	n = cint(rows[0].n) if rows else 0
	return _badge("bad", "openNotices", count=n) if n else _badge("ok", "noneOpen")


def _corporate_tax(company: str, on) -> dict | None:
	if not _can(_CT_LOG):
		return None
	rows = frappe.get_list(
		_CT_LOG,
		filters=[["company", "=", company], ["docstatus", "<", 2]],
		fields=["name", "period_start", "period_end", "filing_due_date", "deadline_status", "docstatus"],
		order_by="period_end desc",
		limit=3,
	)
	if not rows:
		return None
	row = rows[0]
	year = getdate(row.period_end).year if row.period_end else ""
	if cint(row.docstatus) == 1 or row.deadline_status == "Filed":
		return _badge("ok", "filedYear", year=year)
	days = (getdate(row.filing_due_date) - on).days if row.filing_due_date else None
	tone = "bad" if days is not None and days < 0 else "warn"
	return _badge(tone, "draftYear", year=year, days=days)


def _compliance(company: str) -> dict | None:
	"""Setup checks the UAE screens already track."""
	try:
		from taxmate.uae.readiness import get_uae_readiness_checklist

		data = get_uae_readiness_checklist(company)
	except (frappe.PermissionError, ImportError):
		return None
	if not data or not data.get("applicable"):
		return None
	items = data.get("items") or []
	open_items = [i for i in items if not i.get("ok")]
	if open_items:
		return _badge("warn", "toFix", count=len(open_items))
	return _badge("ok", "allClear")
