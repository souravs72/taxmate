# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""Live Corporate Tax worksheet from GL + elections (does not file)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import getdate


def execute(filters=None):
	if not frappe.has_permission("UAE CT Filing Log", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	filters = filters or {}
	columns = get_columns()
	if not filters.get("company") or not filters.get("from_date") or not filters.get("to_date"):
		return columns, []
	if getdate(filters["from_date"]) > getdate(filters["to_date"]):
		frappe.throw(_("From Date cannot be after To Date."))
	if not frappe.has_permission("Company", "read", filters["company"]):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from taxmate.uae_corporate_tax.utils.corporate_tax import compute_ct

	result = compute_ct(
		filters["company"],
		filters["from_date"],
		filters["to_date"],
		elect_sbr=int(filters.get("elect_sbr") or 0),
		elect_qfzp=int(filters.get("elect_qfzp") or 0),
	)
	rows = [
		("Regime", result["regime"], ""),
		("Revenue", result["revenue"], _("SBR tests this, not profit")),
		("Expenses", result["expenses"], ""),
		("Accounting profit", result["accounting_profit"], _("From posted GL")),
		("Taxable profit", result["taxable_profit"], _("After add-backs / deductions on a Filing Log")),
		("Tax payable", result["tax_payable"], _("AED")),
		("Qualifying revenue", result["qualifying_revenue"], _("QFZP")),
		("Non-qualifying revenue", result["non_qualifying_revenue"], _("Includes unclassified")),
		("De minimis limit", result["de_minimis_limit"], _("Lower of 5% and AED 5m")),
		("De minimis passed", _("Yes") if result["de_minimis_passed"] else _("No"), ""),
		("Filing due", result["filing_due_date"], _("Period end + 9 months")),
	]
	data = [{"line": label, "amount": amount, "note": note} for label, amount, note in rows]
	return columns, data


def get_columns():
	return [
		{"fieldname": "line", "label": _("Line"), "fieldtype": "Data", "width": 220},
		{"fieldname": "amount", "label": _("Value"), "fieldtype": "Data", "width": 180},
		{"fieldname": "note", "label": _("Note"), "fieldtype": "Data", "width": 320},
	]
