# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""Explain VAT 201 Boxes 6, 7 and 9 from customs, purchases, and capital goods."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.utils.special_regime_ledger import sum_capital_goods_adjustments
from taxmate.uae_vat.utils.vat_201 import r2, sum_customs_declarations


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Source"), "fieldname": "source", "fieldtype": "Data", "width": 220},
		{
			"label": _("Document"),
			"fieldname": "document",
			"fieldtype": "Dynamic Link",
			"options": "document_type",
			"width": 200,
		},
		{
			"label": _("Document Type"),
			"fieldname": "document_type",
			"fieldtype": "Link",
			"options": "DocType",
			"width": 180,
		},
		{"label": _("Box"), "fieldname": "box", "fieldtype": "Data", "width": 70},
		{
			"label": _("Amount (AED)"),
			"fieldname": "amount",
			"fieldtype": "Currency",
			"options": "AED",
			"width": 130,
		},
		{
			"label": _("VAT (AED)"),
			"fieldname": "vat_amount",
			"fieldtype": "Currency",
			"options": "AED",
			"width": 130,
		},
		{"label": _("Linked PI / LCV"), "fieldname": "linked", "fieldtype": "Data", "width": 220},
	]


def get_data(filters):
	company = filters.get("company")
	if not company:
		return []
	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		frappe.throw(_("{0} is not a UAE company.").format(company))
	period_start = filters.get("from_date")
	period_end = filters.get("to_date")
	if not period_start or not period_end:
		frappe.throw(_("Set From Date and To Date."))

	rows = []
	customs = frappe.get_list(
		"UAE Customs Declaration",
		filters={
			"company": company,
			"docstatus": 1,
			"posting_date": ["between", [period_start, period_end]],
		},
		fields=[
			"name",
			"is_adjustment",
			"taxable_amount",
			"vat_amount",
			"purchase_invoice",
			"landed_cost_voucher",
		],
		order_by="posting_date, name",
	)
	for row in customs:
		linked = " / ".join(part for part in (row.purchase_invoice, row.landed_cost_voucher) if part)
		rows.append(
			{
				"source": _("Customs declaration"),
				"document": row.name,
				"document_type": "UAE Customs Declaration",
				"box": "7" if row.is_adjustment else "6",
				"amount": r2(row.taxable_amount),
				"vat_amount": r2(row.vat_amount),
				"linked": linked,
			}
		)

	pi_fields = ["name", "base_net_total", "recoverable_standard_rated_expenses"]
	if frappe.db.has_column("Purchase Invoice", "uae_box_9_taxable_amount"):
		pi_fields.append("uae_box_9_taxable_amount")
	purchases = frappe.get_list(
		"Purchase Invoice",
		filters={
			"company": company,
			"docstatus": 1,
			"posting_date": ["between", [period_start, period_end]],
			"recoverable_standard_rated_expenses": ["!=", 0],
		},
		fields=pi_fields,
		order_by="posting_date, name",
	)
	for row in purchases:
		rows.append(
			{
				"source": _("Recoverable purchase (Box 9)"),
				"document": row.name,
				"document_type": "Purchase Invoice",
				"box": "9",
				"amount": r2(row.get("uae_box_9_taxable_amount") or row.base_net_total),
				"vat_amount": r2(row.recoverable_standard_rated_expenses),
				"linked": "",
			}
		)

	if frappe.db.exists("DocType", "UAE Capital Goods Adjustment"):
		adjustments = frappe.get_list(
			"UAE Capital Goods Adjustment",
			filters={
				"company": company,
				"docstatus": 1,
				"period_end": ["between", [period_start, period_end]],
			},
			fields=["name", "adjustment_amount", "adjustment_vat"],
		)
		for row in adjustments:
			rows.append(
				{
					"source": _("Capital goods adjustment"),
					"document": row.name,
					"document_type": "UAE Capital Goods Adjustment",
					"box": "9",
					"amount": 0,
					"vat_amount": r2(row.adjustment_vat),
					"linked": _("Cost slice {0} is not Box 9 consideration").format(
						r2(row.adjustment_amount)
					),
				}
			)

	totals = sum_customs_declarations(company, period_start, period_end)
	box_9_amount = r2(sum(flt(r["amount"]) for r in rows if r["box"] == "9"))
	box_9_vat = r2(sum(flt(r["vat_amount"]) for r in rows if r["box"] == "9"))
	rows.append(
		{
			"source": _("Totals (Box 6 / 7 / 9)"),
			"document": "",
			"document_type": "",
			"box": "",
			"amount": r2(totals["box_6_amount"] + totals["box_7_amount"] + box_9_amount),
			"vat_amount": r2(totals["box_6_vat_amount"] + totals["box_7_vat_amount"] + box_9_vat),
			"linked": _("Box 6 VAT {0} · Box 7 VAT {1} · Box 9 VAT {2}").format(
				totals["box_6_vat_amount"], totals["box_7_vat_amount"], box_9_vat
			),
		}
	)
	return rows
