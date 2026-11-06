"""Make the Cash Flow statement reconcile to the bank and cash accounts.

Older ERPNext v16 builds only count Receivable, Payable, Stock, Fixed Asset
and Equity movements. Every other balance sheet account is dropped, so
VAT payable, Stock Received But Not Billed, advances, accruals and loans
never reach the statement. For a UAE company the VAT account alone puts
"Net Change in Cash" out of step with the bank.

Newer ERPNext (``496ae67e4b`` and later) adds a "Net Change in Other Balance
Sheet Accounts" row for this. ``complete_cash_flow`` adds the same row, with
the same account rule as ERPNext's ``get_row_account_condition``, when the
installed report does not already return it. It then adds opening and
closing cash lines so the statement can be checked against the bank. When
ERPNext already returns the row, its figures are left untouched.

Opening entries: match whatever the installed Cash Flow typed rows do. Newer
ERPNext excludes them unless Accounts Settings says otherwise; older builds
included them, so the Other row must too or opening stock / Temporary Opening
won't cancel.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cstr, flt, getdate

OTHER_LABEL = "Net Change in Other Balance Sheet Accounts"
# Account types ERPNext already reports on its own Cash Flow rows.
MAPPED_TYPES = ("Depreciation", "Receivable", "Payable", "Stock", "Fixed Asset", "Equity")
CASH_TYPES = ("Cash", "Bank")
OPENING_KEY = "taxmate_opening_cash"
CLOSING_KEY = "taxmate_closing_cash"


def _label(text: str) -> str:
	return cstr(text).strip().strip("'").strip()


def _is_section_row(row: dict, label: str) -> bool:
	return isinstance(row, dict) and _label(row.get("section")) == _label(label)


def run_cash_flow(filters: dict, ignore_prepared_report: bool = True) -> dict:
	"""Run Cash Flow so every figure reconciles to the bank and cash accounts.

	ERPNext's accumulated mode mixes bases: profit accumulates from the range
	start but the balance rows from the fiscal-year start, so a range that
	starts mid-year doesn't add up. Here the report always runs per period,
	is completed, and is then accumulated from the range start (restarting
	each fiscal year), the same way for every row.
	"""
	from frappe.desk.query_report import run

	accumulate = bool(flt(frappe._dict(filters).get("accumulated_values")))
	base = dict(filters, accumulated_values=0)
	result = run(
		"Cash Flow",
		filters=dict(base),
		ignore_prepared_report=ignore_prepared_report,
		are_default_filters=False,
	)
	if isinstance(result, dict):
		complete_cash_flow(result, base)
		if accumulate:
			_accumulate(result, frappe._dict(base))
	return result


def _accumulate(result: dict, filters) -> None:
	"""Turn per-period columns into running totals within each fiscal year.

	Total stays the sum of the periods. Opening becomes the cash at the start
	of each running total; closing is already the cash at each period end.
	"""
	rows = result.get("result")
	periods = _periods(filters, result)
	if not isinstance(rows, list) or not periods:
		return
	keys = [p["key"] for p in periods]
	# A new running total starts at each fiscal-year boundary.
	starts = {keys[i] for i, p in enumerate(periods) if i == 0 or p["fy_start"] != periods[i - 1]["fy_start"]}
	opening_labels = {"Opening", _("Opening"), "Opening Cash Balance", _("Opening Cash Balance")}
	closing_labels = {
		"Closing (Opening + Total)",
		_("Closing (Opening + Total)"),
		"Closing Cash Balance",
		_("Closing Cash Balance"),
	}
	seen = set()
	for r in rows:
		if not isinstance(r, dict) or id(r) in seen or not any(k in r for k in keys):
			continue
		seen.add(id(r))
		label = _label(r.get("section"))
		if label in closing_labels:
			continue
		run_total = 0.0
		for k in keys:
			if label in opening_labels:
				if k in starts:
					run_total = flt(r.get(k))
				r[k] = run_total
				continue
			if k in starts:
				run_total = 0.0
			run_total += flt(r.get(k))
			r[k] = run_total
	_refresh_chart(result, rows, periods)


def complete_cash_flow(result: dict, filters: dict) -> dict:
	"""Add the missing balance sheet movements and opening/closing cash."""
	rows = result.get("result")
	if not isinstance(rows, list) or not rows:
		return result
	filters = frappe._dict(filters or {})
	if filters.get("report_template"):
		return result
	periods = _periods(filters, result)
	if not periods:
		return result

	accumulated = bool(flt(filters.get("accumulated_values")))
	total_keys = _total_keys(periods, accumulated, filters.company)
	ops_header = _("Cash Flow from Operations")
	ops_footer = _("Net Cash from Operations")
	net_label = _("Net Change in Cash")

	has_other = any(_is_section_row(r, OTHER_LABEL) or _is_section_row(r, _(OTHER_LABEL)) for r in rows)
	if not has_other:
		footer_idx = next((i for i, r in enumerate(rows) if _is_section_row(r, ops_footer)), None)
		net_row = next((r for r in rows if _is_section_row(r, net_label)), None)
		if footer_idx is None or net_row is None:
			return result
		currency = rows[footer_idx].get("currency")
		other = {
			"section_name": _(OTHER_LABEL),
			"section": _(OTHER_LABEL),
			"indent": 1,
			"parent_section": ops_header,
			"currency": currency,
		}
		for p in periods:
			start = p["fy_start"] if accumulated else p["from_date"]
			other[p["key"]] = _other_movement(filters, start, p["to_date"])
		other["total"] = sum(flt(other.get(k)) for k in total_keys)
		rows.insert(footer_idx, other)
		for target in (rows[footer_idx + 1], net_row):
			for key in [p["key"] for p in periods] + ["total"]:
				target[key] = flt(target.get(key)) + flt(other.get(key))
		_refresh_summary(result, {ops_footer: rows[footer_idx + 1], net_label: net_row}, total_keys)
		_refresh_chart(result, rows, periods)

	erp_open = _row_by_label(rows, "Opening") or _row_by_label(rows, _("Opening"))
	erp_close = _row_by_label(rows, "Closing (Opening + Total)") or _row_by_label(
		rows, _("Closing (Opening + Total)")
	)
	if erp_open and erp_close:
		# ERPNext asked for its own rows. Its running total was built from the
		# old Net Change in Cash, so restate both from the ledger.
		if not has_other:
			_fill_opening_closing(erp_open, erp_close, periods, filters, accumulated)
		return result
	# Opening and closing cash only mean something for the whole company.
	if not _is_scoped(filters) and not any(r.get(OPENING_KEY) for r in rows if isinstance(r, dict)):
		_add_opening_closing(rows, periods, filters, accumulated, net_label)
	return result


def _row_by_label(rows, label):
	return next((r for r in rows if _is_section_row(r, label)), None)


def _dimension_filters(filters) -> list:
	try:
		from erpnext.accounts.doctype.accounting_dimension.accounting_dimension import (
			get_accounting_dimensions,
		)
	except ImportError:
		return []
	return [d for d in get_accounting_dimensions(as_list=False) if filters.get(d.fieldname)]


def _is_scoped(filters) -> bool:
	return bool(filters.get("cost_center") or filters.get("project") or _dimension_filters(filters))


def _periods(filters, result) -> list[dict]:
	"""ERPNext's own period list, matched to the columns it returned."""
	from erpnext.accounts.report import financial_statements as fs

	try:
		if hasattr(fs, "build_period_list"):
			periods = fs.build_period_list(frappe._dict(filters))
		else:
			periods = fs.get_period_list(
				filters.from_fiscal_year,
				filters.to_fiscal_year,
				filters.period_start_date,
				filters.period_end_date,
				filters.filter_based_on,
				filters.periodicity,
				company=filters.company,
			)
	except Exception:
		frappe.log_error(title="TaxMate Cash Flow periods")
		return []
	if not periods or any(p.get("dimension_value") for p in periods):
		return []
	cols = {c.get("fieldname") for c in result.get("columns") or [] if isinstance(c, dict)}
	if any(p["key"] not in cols for p in periods):
		return []
	from erpnext.accounts.utils import get_fiscal_year

	# Accumulated values restart each fiscal year (ERPNext get_start_date).
	# build_period_list sets year_start_date to the range start, so it can't be used.
	for p in periods:
		p["fy_start"] = get_fiscal_year(p["to_date"], company=filters.company)[1]
	return periods


def _total_keys(periods, accumulated, company) -> list[str]:
	if not accumulated:
		return [p["key"] for p in periods]
	from erpnext.accounts.utils import get_fiscal_year

	last = {}
	for p in periods:
		last[get_fiscal_year(p["to_date"], company=company)[0]] = p["key"]
	return list(last.values())


def _erpnext_other_account_type():
	"""ERPNext's sentinel for the Other row, or None on older builds."""
	try:
		from erpnext.accounts.report.cash_flow.cash_flow import OTHER_BALANCE_SHEET_ACCOUNTS

		return OTHER_BALANCE_SHEET_ACCOUNTS
	except ImportError:
		return None


def _erpnext_filters_opening() -> bool:
	"""True when installed ERPNext Cash Flow typed rows exclude opening GL."""
	import inspect

	try:
		from erpnext.accounts.report.cash_flow.cash_flow import get_account_type_based_gl_data
	except ImportError:
		return False
	return "is_opening" in inspect.getsource(get_account_type_based_gl_data)


def _other_names(company: str) -> list[str]:
	"""Same rule as ERPNext Cash Flow Other: unmapped BS + Depreciation offset."""
	# Prefer ERPNext's own account picker when the Other row exists upstream.
	try:
		from erpnext.accounts.report.cash_flow.cash_flow import get_row_accounts

		sentinel = _erpnext_other_account_type()
		if sentinel:
			return get_row_accounts(company, sentinel)
	except (ImportError, AttributeError, TypeError):
		pass
	excluded = set(MAPPED_TYPES) | set(CASH_TYPES)
	out = []
	accounts = frappe.get_all(
		"Account",
		filters={"company": company, "is_group": 0},
		fields=["name", "root_type", "account_type"],
	)
	for a in accounts:
		atype = a.account_type or ""
		if atype == "Depreciation" or (
			a.root_type in ("Asset", "Liability", "Equity") and atype not in excluded
		):
			out.append(a.name)
	return out


def _cash_names(company: str) -> list[str]:
	return frappe.get_all(
		"Account",
		filters={"company": company, "is_group": 0, "account_type": ["in", list(CASH_TYPES)]},
		pluck="name",
	)


def _gl_query(filters, accounts, sign_credit: bool):
	from frappe.query_builder.functions import Sum

	gl = frappe.qb.DocType("GL Entry")
	amount = (Sum(gl.credit) - Sum(gl.debit)) if sign_credit else (Sum(gl.debit) - Sum(gl.credit))
	q = (
		frappe.qb.from_(gl)
		.select(amount)
		.where(gl.company == filters.company)
		.where(gl.is_cancelled == 0)
		.where(gl.voucher_type != "Period Closing Voucher")
		.where(gl.account.isin(accounts))
	)
	if filters.get("include_default_book_entries"):
		company_fb = frappe.get_cached_value("Company", filters.company, "default_finance_book")
		q = q.where(
			gl.finance_book.isin([cstr(filters.get("finance_book")), cstr(company_fb), ""])
			| gl.finance_book.isnull()
		)
	else:
		q = q.where(gl.finance_book.isin([cstr(filters.get("finance_book")), ""]) | gl.finance_book.isnull())
	if filters.get("cost_center"):
		from erpnext.accounts.report.financial_statements import get_cost_centers_with_children

		q = q.where(gl.cost_center.isin(get_cost_centers_with_children(filters.cost_center)))
	if filters.get("project"):
		projects = (
			filters.project if isinstance(filters.project, list) else frappe.parse_json(filters.project)
		)
		q = q.where(gl.project.isin(projects))
	for dim in _dimension_filters(filters):
		values = filters[dim.fieldname]
		if frappe.get_cached_value("DocType", dim.document_type, "is_tree"):
			from erpnext.accounts.doctype.accounting_dimension.accounting_dimension import (
				get_dimension_with_children,
			)

			values = get_dimension_with_children(dim.document_type, values)
		q = q.where(gl[dim.fieldname].isin(values if isinstance(values, list) else [values]))
	# The user's permission restrictions on GL Entry, same as the report itself.
	from frappe.desk.reportview import build_match_conditions
	from pypika.terms import Bracket, LiteralValue

	if match := build_match_conditions("GL Entry"):
		q = q.where(Bracket(LiteralValue(match)))
	return q, gl


def _ignore_opening_check() -> bool:
	try:
		return bool(frappe.get_single_value("Accounts Settings", "ignore_is_opening_check_for_reporting"))
	except Exception:
		return False


def _other_movement(filters, start, end) -> float:
	# Prefer ERPNext's GL helper so filters (opening, FB, dimensions) match.
	sentinel = _erpnext_other_account_type()
	if sentinel:
		try:
			from erpnext.accounts.report.cash_flow.cash_flow import get_account_type_based_gl_data

			local = frappe._dict(filters)
			local.start_date = start
			local.end_date = end
			local.account_type = sentinel
			return flt(get_account_type_based_gl_data(filters.company, local))
		except (ImportError, AttributeError, TypeError):
			pass
	accounts = _other_names(filters.company)
	if not accounts:
		return 0.0
	q, gl = _gl_query(filters, accounts, sign_credit=True)
	q = q.where(gl.posting_date >= start).where(gl.posting_date <= end)
	# Match typed-row opening behaviour on the installed ERPNext.
	if _erpnext_filters_opening() and not _ignore_opening_check():
		q = q.where(gl.is_opening != "Yes")
	res = q.run()
	return flt(res[0][0]) if res and res[0][0] else 0.0


def _cash_balance(filters, before) -> float:
	"""Bank and cash balance before ``before``. Opening entries count as opening."""
	accounts = _cash_names(filters.company)
	if not accounts:
		return 0.0
	q, gl = _gl_query(filters, accounts, sign_credit=False)
	cond = gl.posting_date < before
	if not _ignore_opening_check():
		cond = cond | (gl.is_opening == "Yes")
	res = q.where(cond).run()
	return flt(res[0][0]) if res and res[0][0] else 0.0


def _add_opening_closing(rows, periods, filters, accumulated, net_label) -> None:
	net_idx = next((i for i, r in enumerate(rows) if _is_section_row(r, net_label)), None)
	if net_idx is None:
		return
	net_row = rows[net_idx]
	currency = net_row.get("currency")
	opening = {
		"section_name": _("Opening Cash Balance"),
		"section": _("Opening Cash Balance"),
		"currency": currency,
		OPENING_KEY: 1,
	}
	closing = {
		"section_name": _("Closing Cash Balance"),
		"section": _("Closing Cash Balance"),
		"currency": currency,
		CLOSING_KEY: 1,
	}
	_fill_opening_closing(opening, closing, periods, filters, accumulated)
	rows.insert(net_idx, opening)
	rows.insert(net_idx + 2, closing)


def _fill_opening_closing(opening, closing, periods, filters, accumulated) -> None:
	"""Opening = cash before the period starts (its fiscal-year start when values
	are accumulated); closing = cash at the period end. So opening + Net Change
	in Cash = closing in every column, and in Total."""
	from frappe.utils import add_days

	for p in periods:
		start = p["fy_start"] if accumulated else p["from_date"]
		opening[p["key"]] = _cash_balance(filters, getdate(start))
		closing[p["key"]] = _cash_balance(filters, add_days(getdate(p["to_date"]), 1))
	first = periods[0]
	opening["total"] = _cash_balance(
		filters, getdate(first["fy_start"] if accumulated else first["from_date"])
	)
	closing["total"] = closing[periods[-1]["key"]]


def _refresh_summary(result, totals: dict, total_keys) -> None:
	summary = result.get("report_summary")
	if not isinstance(summary, list):
		return
	for item in summary:
		if not isinstance(item, dict):
			continue
		for label, row in totals.items():
			if _label(item.get("label")) == _label(label):
				item["value"] = sum(flt(row.get(k)) for k in total_keys)


def _refresh_chart(result, rows, periods) -> None:
	chart = result.get("chart")
	data = chart.get("data") if isinstance(chart, dict) else None
	datasets = data.get("datasets") if isinstance(data, dict) else None
	if not isinstance(datasets, list):
		return
	by_name = {_label(r.get("section")): r for r in rows if isinstance(r, dict) and r.get("section")}
	for ds in datasets:
		row = by_name.get(_label(ds.get("name")))
		if row:
			ds["values"] = [row.get(p["key"]) for p in periods]
