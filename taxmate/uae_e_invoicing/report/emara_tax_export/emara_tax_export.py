# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""EmaraTax VAT 201 worksheet.

Computes every box of the FTA's VAT 201 return for the selected Company and
period so it can be checked and then typed into the EmaraTax portal (or
attached as the backup for a return already filed). Boxes 6 and 7 default
from submitted UAE Customs Declarations; report filters still override.

This report does not submit anything to the FTA. As of 2026-09 there is no
confirmed EmaraTax filing API to integrate against (see the TaxMate UAE Gap
Analysis & Build Plan) -- this is the honest, buildable half of "EmaraTax
export": a correct worksheet, not a false promise of one-click filing.
"""

from __future__ import annotations

from frappe import _

from taxmate.uae_vat.utils.vat_201 import compute_vat_201


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()

	if not filters.get("company") or not filters.get("from_date") or not filters.get("to_date"):
		return columns, [
			{
				"box_no": "",
				"legend": _("Set Company, From Date and To Date to compute the VAT 201 worksheet."),
				"amount": None,
				"vat_amount": None,
			}
		]

	from taxmate.uae_vat.utils.vat_201 import sum_customs_declarations

	box_6_amount = filters.get("box_6_amount")
	box_6_vat_amount = filters.get("box_6_vat_amount")
	box_7_amount = filters.get("box_7_amount")
	box_7_vat_amount = filters.get("box_7_vat_amount")
	override = any(
		_filter_was_set(filters, key)
		for key in (
			"box_6_amount",
			"box_6_vat_amount",
			"box_7_amount",
			"box_7_vat_amount",
		)
	)
	if not override:
		customs = sum_customs_declarations(filters["company"], filters["from_date"], filters["to_date"])
		box_6_amount = customs["box_6_amount"]
		box_6_vat_amount = customs["box_6_vat_amount"]
		box_7_amount = customs["box_7_amount"]
		box_7_vat_amount = customs["box_7_vat_amount"]

	result = compute_vat_201(
		company=filters["company"],
		period_start=filters["from_date"],
		period_end=filters["to_date"],
		box_6_amount=box_6_amount or 0,
		box_6_vat_amount=box_6_vat_amount or 0,
		box_7_amount=box_7_amount or 0,
		box_7_vat_amount=box_7_vat_amount or 0,
	)

	data = [
		{
			"box_no": row["box_no"],
			"legend": row["legend"],
			"amount": row["amount"] or None,
			"vat_amount": row["vat_amount"],
			"bold": 1 if row["is_subtotal"] else 0,
		}
		for row in result["boxes"]
	]

	return columns, data


def _filter_was_set(filters: dict, key: str) -> bool:
	"""True when the operator typed a Box 6/7 override (empty/None means use customs)."""
	if key not in filters:
		return False
	value = filters.get(key)
	return value not in (None, "")


def get_columns():
	return [
		{"fieldname": "box_no", "label": _("Box"), "fieldtype": "Data", "width": 60},
		{"fieldname": "legend", "label": _("Legend"), "fieldtype": "Data", "width": 420},
		{
			"fieldname": "amount",
			"label": _("Amount (AED)"),
			"fieldtype": "Currency",
			"options": "AED",
			"width": 140,
		},
		{
			"fieldname": "vat_amount",
			"label": _("VAT Amount (AED)"),
			"fieldtype": "Currency",
			"options": "AED",
			"width": 160,
		},
	]
