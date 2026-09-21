"""UAE Corporate Tax worksheet: accounting profit → taxable profit → tax due.

Does not e-file. Numbers are AED, rounded to 2 decimals (FTA style).
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import add_days, add_months, flt, getdate, nowdate

from taxmate.uae_corporate_tax.constants import (
	DE_MINIMIS_AMOUNT_AED,
	DE_MINIMIS_PERCENT,
	FILING_MONTHS_AFTER_PERIOD,
	SBR_LAST_PERIOD_END,
	SBR_REVENUE_THRESHOLD_AED,
	STANDARD_RATE_PERCENT,
	ZERO_RATE_BAND_AED,
)


def r2(value) -> float:
	return flt(value, 2)


def filing_due_date(period_end):
	if not period_end:
		return None
	return add_months(getdate(period_end), FILING_MONTHS_AFTER_PERIOD)


def filing_deadline_status(due, docstatus, today=None, lead_days: int = 30) -> str:
	if int(docstatus or 0) == 1:
		return "Filed"
	if not due:
		return "—"
	today = getdate(today or nowdate())
	due = getdate(due)
	if today > due:
		return "Overdue"
	if today >= add_days(due, -int(lead_days or 0)):
		return "Due"
	return "Upcoming"


def taxable_profit(accounting_profit, adjustments: list[dict] | None = None) -> float:
	add_backs = 0.0
	deductions = 0.0
	for row in adjustments or []:
		amount = flt(row.get("amount"))
		kind = (row.get("adjustment_type") or row.get("type") or "").strip()
		if kind == "Add-back":
			add_backs += amount
		elif kind == "Deduction":
			deductions += amount
	return r2(flt(accounting_profit) + add_backs - deductions)


def standard_tax(
	taxable: float,
	zero_band: float = ZERO_RATE_BAND_AED,
	rate: float = STANDARD_RATE_PERCENT,
) -> float:
	return r2(max(0.0, flt(taxable) - flt(zero_band)) * flt(rate) / 100.0)


def sbr_available(
	revenue: float,
	prior_max_revenue: float,
	period_end,
	threshold: float = SBR_REVENUE_THRESHOLD_AED,
) -> bool:
	"""SBR: revenue ≤ AED 3m this period and every previous period; periods ending ≤ 2026-12-31."""
	if getdate(period_end) > getdate(SBR_LAST_PERIOD_END):
		return False
	return flt(revenue) <= flt(threshold) and flt(prior_max_revenue) <= flt(threshold)


def de_minimis_limit(
	total_revenue: float, percent: float = DE_MINIMIS_PERCENT, cap: float = DE_MINIMIS_AMOUNT_AED
) -> float:
	if flt(total_revenue) <= 0:
		return 0.0
	return r2(min(flt(total_revenue) * flt(percent) / 100.0, flt(cap)))


def de_minimis_ok(
	non_qualifying_revenue: float,
	total_revenue: float,
	percent: float = DE_MINIMIS_PERCENT,
	cap: float = DE_MINIMIS_AMOUNT_AED,
) -> bool:
	return flt(non_qualifying_revenue) <= de_minimis_limit(total_revenue, percent, cap)


def qfzp_tax(
	taxable: float,
	qualifying_revenue: float,
	non_qualifying_revenue: float,
	total_revenue: float,
	rate: float = STANDARD_RATE_PERCENT,
	percent: float = DE_MINIMIS_PERCENT,
	cap: float = DE_MINIMIS_AMOUNT_AED,
) -> tuple[float, bool]:
	"""QFZP: 0% on qualifying share; 9% on the rest. No AED 375k band.

	If de minimis fails, the whole taxable profit is taxed at 9%.
	The qualifying/non-qualifying split of taxable profit follows revenue weights.
	"""
	ok = de_minimis_ok(non_qualifying_revenue, total_revenue, percent, cap)
	taxable = flt(taxable)
	if not ok:
		return r2(max(0.0, taxable) * flt(rate) / 100.0), False
	if flt(total_revenue) <= 0:
		return 0.0, True
	nq_share = min(1.0, flt(non_qualifying_revenue) / flt(total_revenue))
	nq_taxable = taxable * nq_share
	return r2(max(0.0, nq_taxable) * flt(rate) / 100.0), True


def compute_ct(
	company: str,
	period_start,
	period_end,
	adjustments: list[dict] | None = None,
	elect_sbr: int | None = None,
	elect_qfzp: int | None = None,
	settings: dict | None = None,
	gl: dict | None = None,
	split: dict | None = None,
	prior: float | None = None,
) -> dict[str, Any]:
	"""Build the year-end CT pack numbers from GL + adjustments + elections."""
	settings = settings if settings is not None else get_ct_settings(company)
	zero_band = _setting(settings, "zero_rate_band", ZERO_RATE_BAND_AED)
	rate = _setting(settings, "standard_rate", STANDARD_RATE_PERCENT)
	sbr_threshold = _setting(settings, "sbr_revenue_threshold", SBR_REVENUE_THRESHOLD_AED)
	de_pct = _setting(settings, "de_minimis_percent", DE_MINIMIS_PERCENT)
	de_cap = _setting(settings, "de_minimis_amount", DE_MINIMIS_AMOUNT_AED)

	if elect_sbr is None:
		elect_sbr = int(settings.get("elect_small_business_relief") or 0)
	if elect_qfzp is None:
		elect_qfzp = int(settings.get("elect_qfzp") or 0)

	gl = gl if gl is not None else fetch_gl_totals(company, period_start, period_end)
	split = split if split is not None else fetch_income_split(company, period_start, period_end)
	if prior is None:
		prior = prior_max_revenue(company, period_end)

	profit = gl["accounting_profit"]
	revenue = gl["revenue"]
	split = _absorb_unclassified_gl_income(split, revenue)
	taxable = taxable_profit(profit, adjustments)

	regime = "Standard"
	tax = 0.0
	sbr_ok = False
	de_minimis_passed = True

	if elect_sbr and elect_qfzp:
		frappe.throw(_("Small Business Relief and QFZP cannot be elected in the same tax period."))

	if elect_qfzp:
		regime = "QFZP"
		tax, de_minimis_passed = qfzp_tax(
			taxable,
			split["qualifying_revenue"],
			split["non_qualifying_revenue"],
			revenue,
			rate=rate,
			percent=de_pct,
			cap=de_cap,
		)
		if not de_minimis_passed:
			regime = "QFZP (de minimis failed)"
	elif elect_sbr:
		sbr_ok = sbr_available(revenue, prior, period_end, threshold=sbr_threshold)
		if sbr_ok:
			regime = "Small Business Relief"
			taxable = 0.0
			tax = 0.0
		else:
			tax = standard_tax(taxable, zero_band=zero_band, rate=rate)
	else:
		tax = standard_tax(taxable, zero_band=zero_band, rate=rate)

	return {
		"company": company,
		"period_start": period_start,
		"period_end": period_end,
		"filing_due_date": filing_due_date(period_end),
		"regime": regime,
		"revenue": r2(revenue),
		"expenses": r2(gl["expenses"]),
		"accounting_profit": r2(profit),
		"taxable_profit": r2(taxable),
		"tax_payable": r2(tax),
		"zero_rate_band": r2(zero_band),
		"standard_rate": r2(rate),
		"sbr_elected": int(elect_sbr or 0),
		"sbr_available": int(sbr_ok),
		"qfzp_elected": int(elect_qfzp or 0),
		"qualifying_revenue": r2(split["qualifying_revenue"]),
		"non_qualifying_revenue": r2(split["non_qualifying_revenue"]),
		"unclassified_revenue": r2(split["unclassified_revenue"]),
		"de_minimis_limit": de_minimis_limit(revenue, de_pct, de_cap),
		"de_minimis_passed": int(de_minimis_passed),
		"prior_max_revenue": r2(prior),
		"fta_note": _(
			"This worksheet does not file the Corporate Tax return. Prepare the pack and file on the FTA portal."
		),
	}


def _setting(settings: dict, key: str, default: float) -> float:
	value = settings.get(key)
	return flt(default) if value is None else flt(value)


def _absorb_unclassified_gl_income(split: dict[str, float], gl_revenue: float) -> dict[str, float]:
	"""Treat GL income that is not on a classified Sales Invoice as non-qualifying."""
	out = dict(split)
	si_total = flt(out.get("qualifying_revenue")) + flt(out.get("non_qualifying_revenue"))
	other = r2(max(0.0, flt(gl_revenue) - si_total))
	if other:
		out["non_qualifying_revenue"] = r2(flt(out.get("non_qualifying_revenue")) + other)
		out["unclassified_revenue"] = r2(flt(out.get("unclassified_revenue")) + other)
	return out


def get_ct_settings(company: str) -> dict[str, Any]:
	if not company or not frappe.db.exists("DocType", "UAE CT Settings"):
		return {}
	name = frappe.db.get_value("UAE CT Settings", {"company": company}, "name")
	if not name:
		return {}
	doc = frappe.get_cached_doc("UAE CT Settings", name)
	return {
		"elect_small_business_relief": doc.get("elect_small_business_relief"),
		"elect_qfzp": doc.get("elect_qfzp"),
		"zero_rate_band": doc.get("zero_rate_band"),
		"standard_rate": doc.get("standard_rate"),
		"sbr_revenue_threshold": doc.get("sbr_revenue_threshold"),
		"de_minimis_percent": doc.get("de_minimis_percent"),
		"de_minimis_amount": doc.get("de_minimis_amount"),
		"reminder_days": doc.get("reminder_days"),
		"enable_withholding": doc.get("enable_withholding"),
	}


def fetch_gl_totals(company: str, period_start, period_end) -> dict[str, float]:
	"""Income - expense from posted GL (cancelled rows excluded)."""
	if not frappe.db.exists("DocType", "GL Entry"):
		return {"revenue": 0.0, "expenses": 0.0, "accounting_profit": 0.0}
	row = frappe.db.sql(
		"""
		select
			sum(case when a.root_type = 'Income' then ge.credit - ge.debit else 0 end) as revenue,
			sum(case when a.root_type = 'Expense' then ge.debit - ge.credit else 0 end) as expenses
		from `tabGL Entry` ge
		inner join `tabAccount` a on a.name = ge.account
		where ge.company = %(company)s
			and ge.is_cancelled = 0
			and ge.voucher_type != 'Period Closing Voucher'
			and ifnull(ge.is_opening, 'No') = 'No'
			and ge.posting_date between %(from_date)s and %(to_date)s
		""",
		{"company": company, "from_date": period_start, "to_date": period_end},
		as_dict=True,
	)
	revenue = flt(row[0].revenue) if row else 0.0
	expenses = flt(row[0].expenses) if row else 0.0
	return {
		"revenue": r2(revenue),
		"expenses": r2(expenses),
		"accounting_profit": r2(revenue - expenses),
	}


def fetch_income_split(company: str, period_start, period_end) -> dict[str, float]:
	"""QFZP revenue split from submitted Sales Invoices."""
	empty = {"qualifying_revenue": 0.0, "non_qualifying_revenue": 0.0, "unclassified_revenue": 0.0}
	if not frappe.db.exists("DocType", "Sales Invoice"):
		return empty
	class_field = (
		"ifnull(si.uae_ct_income_class, 'Unclassified')"
		if frappe.db.has_column("Sales Invoice", "uae_ct_income_class")
		else "'Unclassified'"
	)
	rows = frappe.db.sql(
		f"""
		select {class_field} as cls, sum(si.base_net_total) as amount
		from `tabSales Invoice` si
		where si.docstatus = 1 and si.company = %(company)s
			and si.posting_date between %(from_date)s and %(to_date)s
		group by cls
		""",
		{"company": company, "from_date": period_start, "to_date": period_end},
		as_dict=True,
	)
	out = dict(empty)
	for row in rows or []:
		amount = flt(row.amount)
		if row.cls == "Qualifying":
			out["qualifying_revenue"] += amount
		elif row.cls == "Non-Qualifying":
			out["non_qualifying_revenue"] += amount
		else:
			out["unclassified_revenue"] += amount
			out["non_qualifying_revenue"] += amount
	return {key: r2(value) for key, value in out.items()}


def prior_max_revenue(company: str, period_end) -> float:
	"""Highest revenue already recorded on a submitted CT Filing Log before this period."""
	if not frappe.db.exists("DocType", "UAE CT Filing Log"):
		return 0.0
	value = frappe.db.sql(
		"""
		select max(revenue) as prior
		from `tabUAE CT Filing Log`
		where company = %(company)s and docstatus = 1 and period_end < %(period_end)s
		""",
		{"company": company, "period_end": period_end},
	)
	return r2(value[0][0]) if value and value[0][0] is not None else 0.0


def list_related_party_invoices(company: str, period_start, period_end) -> list[dict]:
	if not frappe.db.has_column("Sales Invoice", "uae_related_party"):
		return []
	sales = frappe.db.sql(
		"""
		select 'Sales Invoice' as doctype, name, posting_date, customer as party,
			base_net_total as amount
		from `tabSales Invoice`
		where docstatus = 1 and company = %(company)s
			and posting_date between %(from_date)s and %(to_date)s
			and ifnull(uae_related_party, 0) = 1
		""",
		{"company": company, "from_date": period_start, "to_date": period_end},
		as_dict=True,
	)
	purchases = []
	if frappe.db.has_column("Purchase Invoice", "uae_related_party"):
		purchases = frappe.db.sql(
			"""
			select 'Purchase Invoice' as doctype, name, posting_date, supplier as party,
				base_net_total as amount
			from `tabPurchase Invoice`
			where docstatus = 1 and company = %(company)s
				and posting_date between %(from_date)s and %(to_date)s
				and ifnull(uae_related_party, 0) = 1
			""",
			{"company": company, "from_date": period_start, "to_date": period_end},
			as_dict=True,
		)
	return list(sales) + list(purchases)


def party_is_related(company: str, party_type: str, party: str | None) -> bool:
	if not party or not frappe.db.exists("DocType", "UAE Related Party"):
		return False
	return bool(
		frappe.db.exists(
			"UAE Related Party",
			{"company": company, "party_type": party_type, "party": party},
		)
	)


@frappe.whitelist()
def get_ct_elections(company: str) -> dict[str, int]:
	if not company or not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	settings = get_ct_settings(company)
	return {
		"elect_sbr": int(settings.get("elect_small_business_relief") or 0),
		"elect_qfzp": int(settings.get("elect_qfzp") or 0),
	}
