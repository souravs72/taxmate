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

	rate = flt(doc.get("conversion_rate")) or 1.0
	item_vats = [line_vat_in_aed(item.get("tax_amount"), rate) for item in items]

	doc.recoverable_standard_rated_expenses = recoverable_vat_from_items(
		item_vats, item_percents, header_vat=header_vat
	)
	if hasattr(doc, "uae_box_9_taxable_amount"):
		doc.uae_box_9_taxable_amount = flt(
			sum(flt(item.get("base_net_amount")) for item, pct in zip(items, item_percents, strict=True) if flt(pct) > 0),
			2,
		)
