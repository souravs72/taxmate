"""Input-tax recoverability for UAE VAT 201 Box 9.

Capital-goods adjustment periods live on UAE Capital Goods Record / Adjustment.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt

from taxmate.uae.constants import UAE_COUNTRY


def recovery_percent_for_template(template: dict | None) -> float:
	"""Return 0-100 recovery percent from an Item Tax Template row/dict.

	Blocked templates (checkbox or FTA block reason) are 0%. Missing percent
	defaults to 100% (full recovery).
	"""
	if not template:
		return 100.0
	if template.get("uae_blocked_input_tax") or template.get("uae_input_tax_block_reason"):
		return 0.0
	pct = template.get("uae_input_tax_recovery_percent")
	if pct is None or pct == "":
		return 100.0
	return max(0.0, min(100.0, flt(pct)))


def recoverable_vat_from_items(
	item_vats: list[float],
	item_percents: list[float],
	header_vat: float = 0.0,
) -> float:
	"""Apply per-line recovery % to each line's VAT (not net-weighted header VAT).

	When item VAT amounts are missing, fall back to header VAT using a single
	shared percent, or the most conservative percent if they differ.
	"""
	if len(item_vats) != len(item_percents):
		raise ValueError("item_vats and item_percents must be the same length")

	if any(flt(v) for v in item_vats):
		recoverable = sum(flt(v) * flt(p) / 100.0 for v, p in zip(item_vats, item_percents, strict=True))
		return flt(recoverable, 2)

	header_vat = flt(header_vat)
	if not header_vat:
		return 0.0
	if not item_percents:
		return flt(header_vat, 2)
	unique = {flt(p) for p in item_percents}
	pct = unique.pop() if len(unique) == 1 else min(flt(p) for p in item_percents)
	return flt(header_vat * pct / 100.0, 2)


def _line_uae_vat(doc, vat_accounts: set[str]) -> list[float]:
	"""Per-line VAT from Item Wise Tax Detail rows on UAE VAT accounts.

	An empty list means the breakup is not on the document yet; the caller
	then uses the header VAT on those same accounts.
	"""
	items = list(doc.get("items") or [])
	details = doc.get("item_wise_tax_details") or []
	if not items or not details or not vat_accounts:
		return []
	taxes = {row.get("name"): row for row in (doc.get("taxes") or []) if row.get("name")}
	index = {item.get("name"): i for i, item in enumerate(items) if item.get("name")}
	if not taxes or not index:
		return []
	totals = [0.0] * len(items)
	for detail in details:
		tax = taxes.get(detail.get("tax_row"))
		if not tax or tax.get("account_head") not in vat_accounts:
			continue
		idx = index.get(detail.get("item_row"))
		if idx is None:
			continue
		totals[idx] += flt(detail.get("amount"))
	return totals


def line_vat_in_aed(tax_amount: float, conversion_rate: float) -> float:
	"""Convert item tax_amount (document currency) to AED."""
	return flt(tax_amount) * (flt(conversion_rate) or 1.0)


def recovery_map_for_templates(template_names: list[str]) -> dict[str, float]:
	"""Batch-load recovery percents for Item Tax Templates (no N+1)."""
	unique = list({name for name in template_names if name})
	if not unique:
		return {}
	if not frappe.db.has_column("Item Tax Template", "uae_blocked_input_tax"):
		return {}

	fields = ["name", "uae_blocked_input_tax", "uae_input_tax_recovery_percent"]
	if frappe.db.has_column("Item Tax Template", "uae_input_tax_block_reason"):
		fields.append("uae_input_tax_block_reason")

	rows = frappe.get_all(
		"Item Tax Template",
		filters={"name": ["in", unique]},
		fields=fields,
	)
	return {row.name: recovery_percent_for_template(row) for row in rows}


def standard_rated_vat(stored: float, account_vat: float, manual: bool = False) -> float:
	"""VAT that belongs in box 9 for one purchase invoice.

	A manual figure is kept. A stored recoverable amount is kept when it is
	positive and not larger than the tax posted to UAE VAT accounts (that is
	the figure ``apply_box_9_recoverable`` stores, including a recovery
	percent below 100). A larger stored figure is excise or another non-VAT
	tax and is replaced by the UAE VAT account total. Nothing is written back
	to the invoice.
	"""
	stored = flt(stored)
	account_vat = flt(account_vat)
	if manual:
		return stored
	if stored > 0 and stored <= account_vat + 0.009:
		return stored
	return account_vat


def apply_box_9_recoverable(doc) -> None:
	"""Set Purchase Invoice.recoverable_standard_rated_expenses from line VAT.

	Recomputes on every validate unless ``uae_box_9_manual`` is set.
	"""
	if getattr(doc, "flags", None) and doc.flags.get("skip_uae_vat_defaults"):
		return

	company = doc.get("company")
	if not company:
		return
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		return
	if not hasattr(doc, "recoverable_standard_rated_expenses"):
		return
	if doc.get("uae_box_9_manual"):
		return

	items = doc.get("items") or []
	recovery_map = recovery_map_for_templates([item.get("item_tax_template") for item in items])
	item_percents = [recovery_map.get(item.get("item_tax_template"), 100.0) for item in items]

	if doc.get("reverse_charge") == "Y":
		if item_percents and hasattr(doc, "recoverable_reverse_charge"):
			doc.recoverable_reverse_charge = min(item_percents)
		return

	vat_accounts = set(
		frappe.get_all(
			"UAE VAT Account",
			filters={"parent": company},
			pluck="account",
		)
	)
	header_vat = 0.0
	if vat_accounts:
		header_vat = sum(
			flt(row.get("base_tax_amount"))
			for row in doc.get("taxes") or []
			if row.get("account_head") in vat_accounts
		)

	# Item.tax_amount is every tax on the line, including excise. Desk's
	# recoverable standard-rated field is the VAT on UAE VAT accounts.
	item_vats = _line_uae_vat(doc, vat_accounts)
	if len(item_vats) != len(items):
		item_vats = [0.0] * len(items)

	doc.recoverable_standard_rated_expenses = recoverable_vat_from_items(
		item_vats, item_percents, header_vat=header_vat
	)
	if hasattr(doc, "uae_box_9_taxable_amount"):
		if not flt(doc.recoverable_standard_rated_expenses):
			doc.uae_box_9_taxable_amount = 0
		else:
			doc.uae_box_9_taxable_amount = flt(
				sum(
					flt(item.get("base_net_amount"))
					for item, pct in zip(items, item_percents, strict=True)
					if flt(pct) > 0
				),
				2,
			)
