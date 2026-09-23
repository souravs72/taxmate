"""Stock helpers for the TaxMate SPA (on-hand qty)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import flt

from taxmate.api.resource import assert_allowed_doctype, assert_company_read, require_login


@frappe.whitelist()
def item_qty(item_code: str, company: str | None = None) -> dict[str, Any]:
	"""On-hand quantity by warehouse for one Item.

	Aggregates Bin through get_list so the Item form can show stock without
	cataloguing Bin for general SPA list access.
	"""
	require_login()
	code = (item_code or "").strip()
	if not code:
		frappe.throw(_("Item is required"))
	assert_allowed_doctype("Item")
	if not frappe.has_permission("Item", "read", code):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	company = company or frappe.defaults.get_user_default("Company")
	assert_company_read(company)

	if not frappe.has_permission("Bin", "read"):
		return {"item_code": code, "company": company, "total": 0.0, "warehouses": []}

	rows = frappe.get_list(
		"Bin",
		filters=[["item_code", "=", code], ["actual_qty", "!=", 0]],
		fields=["warehouse", "actual_qty", "reserved_qty", "ordered_qty", "projected_qty"],
		limit_page_length=200,
	)

	warehouses: list[dict[str, Any]] = []
	total = 0.0
	for row in rows:
		wh = row.warehouse
		if company and wh and not _warehouse_in_company(wh, company):
			continue
		qty = flt(row.actual_qty)
		total += qty
		warehouses.append(
			{
				"warehouse": wh,
				"actual_qty": qty,
				"reserved_qty": flt(row.reserved_qty),
				"ordered_qty": flt(row.ordered_qty),
				"projected_qty": flt(row.projected_qty),
			}
		)

	return {"item_code": code, "company": company, "total": total, "warehouses": warehouses}


def _warehouse_in_company(warehouse: str, company: str) -> bool:
	wh_company = frappe.db.get_value("Warehouse", warehouse, "company")
	return not wh_company or wh_company == company
