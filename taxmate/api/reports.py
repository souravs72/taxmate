"""Run TaxMate financial and UAE reports."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api import catalog_reports
from taxmate.api.resource import _parse, assert_company_read, require_login
from taxmate.utils.company import get_default_company
from taxmate.utils.localize import localize_report


def assert_allowed_report(report_name: str) -> None:
	allowed = {row["report"] for row in catalog_reports()}
	if report_name not in allowed:
		frappe.throw(
			_("Report {0} is not part of the TaxMate accounts API").format(report_name),
			frappe.PermissionError,
		)


@frappe.whitelist()
def list_reports() -> list[dict[str, str]]:
	require_login()
	return catalog_reports()


@frappe.whitelist()
def run_report(report_name: str, filters=None, ignore_prepared_report: bool = True) -> dict[str, Any]:
	require_login()
	assert_allowed_report(report_name)
	filters = _as_filter_dict(filters)
	# Sidebar reports follow the company in the header. A caller-supplied
	# company is replaced so one request cannot read another mapped company.
	active = get_default_company()
	if active:
		filters["company"] = active
	assert_company_read(filters.get("company"))

	# Trial Balance clamps its dates to `fiscal_year`. The screen sends the
	# session's current year, so a range in another year came back with the
	# wrong figures. Use the fiscal year that contains From Date.
	if report_name == "Trial Balance" and filters.get("from_date"):
		_set_fiscal_year_from_date(filters)

	# ERPNext Receivable/Payable reports expect party to be a list/tuple for pypika criteria
	if report_name in ("Accounts Payable", "Accounts Receivable") and "party" in filters:
		party_val = filters["party"]
		if isinstance(party_val, str):
			filters["party"] = [p.strip() for p in party_val.split(",") if p.strip()]
		elif not isinstance(party_val, (list, tuple)) and party_val:
			filters["party"] = [party_val]

	from frappe.desk.query_report import get_report_doc, run

	# P&L / TB wrap totals as "'Profit for the year'". Those are not Account
	# names. GL throws "does not exists" if that string is used as a filter.
	if report_name == "General Ledger" and not _keep_existing_accounts(filters):
		get_report_doc(report_name)
		result = {"result": [], "columns": []}
		localize_report(report_name, result)
		return result

	if report_name == "Cash Flow":
		# Older ERPNext v16 leaves VAT, accruals and other balance sheet movements
		# out of Cash Flow, so Net Change in Cash disagrees with the bank. This
		# adds them, plus opening and closing cash, and builds accumulated
		# columns on one basis. Figures ERPNext already reports are kept.
		from taxmate.utils.cash_flow import run_cash_flow

		result = run_cash_flow(filters, ignore_prepared_report=ignore_prepared_report)
	else:
		result = run(
			report_name,
			filters=filters,
			ignore_prepared_report=ignore_prepared_report,
			are_default_filters=False,
		)
	# Report id stays English for the route. The heading and account labels follow User.language.
	if isinstance(result, dict):
		localize_report(report_name, result)
		if report_name in _TREE_REPORTS:
			_mark_ledger_accounts(result, filters.get("company"))
	# Box 9 on the SPA is the UAE VAT account total. This does not update invoices.
	if report_name == "UAE VAT 201" and isinstance(result, dict):
		from taxmate.uae_vat.utils.vat_201 import stamp_box_9

		stamp_box_9(result, filters)
	return result


def _as_filter_dict(filters) -> dict:
	filters = _parse(filters)
	if filters is None:
		return {}
	if isinstance(filters, dict):
		return filters
	frappe.throw(_("filters must be a JSON object"), frappe.ValidationError)


_TREE_REPORTS = frozenset(
	{
		"Profit and Loss Statement",
		"Balance Sheet",
		"Cash Flow",
		"Trial Balance",
	}
)


def _account_names(value) -> list[str]:
	if isinstance(value, str):
		return [value] if value.strip() else []
	if isinstance(value, (list, tuple)):
		return [row for row in value if isinstance(row, str) and row.strip()]
	return []


def _keep_existing_accounts(filters: dict) -> bool:
	"""Leave GL account filters that exist. Drop statement totals.

	Returns False when the caller asked for an account and none of the names
	are Account documents, so the report must not run unfiltered.
	"""
	asked = _account_names(filters.get("account"))
	if not asked:
		return True
	company = filters.get("company")
	if not company:
		return True
	found = set(
		frappe.get_all(
			"Account",
			filters={"company": company, "name": ["in", asked]},
			pluck="name",
		)
	)
	kept = [name for name in asked if name in found]
	if kept:
		filters["account"] = kept
		return True
	return False


def _mark_ledger_accounts(result: dict, company: str | None) -> None:
	"""Stamp ``is_account`` so the SPA does not link P&L / TB total rows."""
	rows = result.get("result")
	if not isinstance(rows, list) or not company:
		return
	wanted = [
		row["account"]
		for row in rows
		if isinstance(row, dict) and isinstance(row.get("account"), str) and row["account"]
	]
	if not wanted:
		return
	names = set(
		frappe.get_all(
			"Account",
			filters={"company": company, "name": ["in", wanted]},
			pluck="name",
		)
	)
	for row in rows:
		if not isinstance(row, dict):
			continue
		acc = row.get("account")
		row["is_account"] = 1 if isinstance(acc, str) and acc in names else 0


def _set_fiscal_year_from_date(filters: dict) -> None:
	from erpnext.accounts.utils import FiscalYearError, get_fiscal_year

	try:
		filters["fiscal_year"] = get_fiscal_year(
			filters["from_date"], company=filters.get("company"), as_dict=True, verbose=0
		).name
	except FiscalYearError:
		# No fiscal year covers the date. Keep what was sent; ERPNext explains.
		frappe.clear_messages()
