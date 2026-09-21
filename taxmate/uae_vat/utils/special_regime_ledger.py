"""Ledger fetchers for Phase 6 special regimes (need a live site)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import cint, flt

from taxmate.uae_vat.utils.special_regimes import margin_amount, margin_vat, merge_emirate_rows


def r2(value) -> float:
	return flt(value, 2)


def apply_box_1_special_regimes(box_1_rows: list[dict], filters: dict) -> list[dict]:
	"""Add margin-scheme VAT and subtract submitted bad-debt relief on Box 1."""
	from taxmate.uae_vat.utils.vat_201 import VAT_201_EMIRATE_ORDER

	ordered = [
		next(
			(row for row in box_1_rows if row["emirate"] == emirate),
			{"emirate": emirate, "amount": 0.0, "vat_amount": 0.0},
		)
		for emirate in VAT_201_EMIRATE_ORDER
	]
	merged = merge_emirate_rows(ordered, _margin_scheme_by_emirate(filters))
	relief = _bad_debt_by_emirate(filters)
	for row in relief:
		row["amount"] = -flt(row.get("amount"))
		row["vat_amount"] = -flt(row.get("vat_amount"))
	merged = merge_emirate_rows(merged, relief)
	return [
		next(
			(row for row in merged if row["emirate"] == emirate),
			{"emirate": emirate, "amount": 0.0, "vat_amount": 0.0},
		)
		for emirate in VAT_201_EMIRATE_ORDER
	]


def _margin_scheme_by_emirate(filters: dict) -> list[dict[str, Any]]:
	if not frappe.db.has_column("Sales Invoice Item", "uae_is_margin_scheme"):
		return []
	rows = frappe.db.sql(
		"""
		select s.vat_emirate as emirate,
			sum(ifnull(i.uae_margin_amount, 0)) as amount,
			sum(ifnull(i.uae_margin_vat, 0)) as vat_amount
		from `tabSales Invoice Item` i
		inner join `tabSales Invoice` s on i.parent = s.name
		where s.docstatus = 1 and s.company = %(company)s
			and s.posting_date between %(from_date)s and %(to_date)s
			and ifnull(i.uae_is_margin_scheme, 0) = 1
		group by s.vat_emirate
		""",
		filters,
		as_dict=True,
	)
	return [
		{"emirate": row.emirate, "amount": r2(row.amount), "vat_amount": r2(row.vat_amount)} for row in rows
	]


def _bad_debt_by_emirate(filters: dict) -> list[dict[str, Any]]:
	if not frappe.db.exists("DocType", "UAE Bad Debt Relief"):
		return []
	rows = frappe.db.sql(
		"""
		select ifnull(s.vat_emirate, '') as emirate,
			sum(r.taxable_amount) as amount,
			sum(r.vat_amount) as vat_amount
		from `tabUAE Bad Debt Relief` r
		left join `tabSales Invoice` s on s.name = r.sales_invoice
		where r.docstatus = 1 and r.company = %(company)s
			and r.write_off_date between %(from_date)s and %(to_date)s
		group by ifnull(s.vat_emirate, '')
		""",
		filters,
		as_dict=True,
	)
	return [
		{"emirate": row.emirate, "amount": r2(row.amount), "vat_amount": r2(row.vat_amount)} for row in rows
	]


def sum_capital_goods_adjustments(company: str, period_start, period_end) -> dict[str, float]:
	empty = {"amount": 0.0, "vat_amount": 0.0}
	if not frappe.db.exists("DocType", "UAE Capital Goods Adjustment"):
		return empty
	row = frappe.db.sql(
		"""
		select sum(adjustment_amount) as amount, sum(adjustment_vat) as vat_amount
		from `tabUAE Capital Goods Adjustment`
		where company = %(company)s and docstatus = 1
			and period_end between %(from_date)s and %(to_date)s
		""",
		{"company": company, "from_date": period_start, "to_date": period_end},
		as_dict=True,
	)
	data = row[0] if row else {}
	return {"amount": r2(data.get("amount") or 0), "vat_amount": r2(data.get("vat_amount") or 0)}


def apply_margin_on_item(item) -> None:
	"""Fill computed margin fields on a Sales Invoice Item."""
	if not cint(item.get("uae_is_margin_scheme")):
		item.uae_margin_amount = 0
		item.uae_margin_vat = 0
		return
	item.uae_margin_amount = margin_amount(item.get("base_net_amount"), item.get("uae_purchase_price"))
	item.uae_margin_vat = margin_vat(item.uae_margin_amount)
