"""Stock helpers for the TaxMate SPA (on-hand qty)."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import flt

from taxmate.api.resource import assert_allowed_doctype, assert_company_read, require_login
from taxmate.utils.company import get_default_company


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

	company = company or get_default_company()
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


@frappe.whitelist()
def stock_entry_item_details(
	company: str,
	purpose: str,
	item_code: str,
	qty: float | int | str = 1,
	warehouse: str | None = None,
	posting_date: str | None = None,
) -> dict[str, Any]:
	"""Rate, batch and serial flags for a Stock Entry line.

	Uses Stock Entry.get_item_details, the same method the stock entry form calls
	when an item is chosen.
	"""
	require_login()
	assert_allowed_doctype("Stock Entry")
	assert_allowed_doctype("Item")
	if not company:
		frappe.throw(_("Company is required"))
	assert_company_read(company)
	code = (item_code or "").strip()
	if not code:
		frappe.throw(_("Item is required"))
	if not frappe.has_permission("Item", "read", code):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if not (
		frappe.has_permission("Stock Entry", "write") or frappe.has_permission("Stock Entry", "create")
	):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from frappe.utils import cint, nowtime, today

	doc = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"company": company,
			"purpose": purpose,
			"stock_entry_type": purpose,
			"posting_date": posting_date or today(),
			"posting_time": nowtime(),
		}
	)
	details = doc.get_item_details(
		frappe._dict(
			{
				"item_code": code,
				"warehouse": warehouse or None,
				"qty": flt(qty) or 1,
				"company": company,
				"allow_zero_valuation": 1,
			}
		)
	)
	return {
		"item_code": code,
		"item_name": details.get("item_name"),
		"stock_uom": details.get("stock_uom"),
		"basic_rate": flt(details.get("basic_rate")),
		"actual_qty": flt(details.get("actual_qty")),
		"has_batch_no": cint(details.get("has_batch_no")),
		"has_serial_no": cint(details.get("has_serial_no")),
		"expense_account": details.get("expense_account"),
		"description": details.get("description"),
	}


@frappe.whitelist()
def reconciliation_balance(
	item_code: str,
	warehouse: str | None = None,
	posting_date: str | None = None,
	company: str | None = None,
	batch_no: str | None = None,
) -> dict[str, Any]:
	"""Qty and valuation rate for a stock reconciliation row.

	Warehouse may be omitted: the response then carries the item name and
	batch/serial flags only. Qty and rate are included once a warehouse in
	this company is passed.
	"""
	require_login()
	assert_allowed_doctype("Stock Reconciliation")
	assert_allowed_doctype("Item")
	code = (item_code or "").strip()
	if not code:
		frappe.throw(_("Item is required"))
	company = company or get_default_company()
	assert_company_read(company)
	if not (
		frappe.has_permission("Stock Reconciliation", "write")
		or frappe.has_permission("Stock Reconciliation", "create")
	):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if not frappe.has_permission("Item", "read", code):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from frappe.utils import cint

	flags = frappe.get_cached_value(
		"Item", code, ["item_name", "has_batch_no", "has_serial_no"], as_dict=True,
	) or {}
	out: dict[str, Any] = {
		"item_code": code,
		"item_name": flags.get("item_name") or code,
		"has_batch_no": cint(flags.get("has_batch_no")),
		"has_serial_no": cint(flags.get("has_serial_no")),
	}
	if not warehouse:
		return out
	if not _warehouse_in_company(warehouse, company):
		frappe.throw(_("Warehouse is not in this company"))

	from erpnext.stock.doctype.stock_reconciliation.stock_reconciliation import get_stock_balance_for
	from frappe.utils import nowtime, today

	balance = get_stock_balance_for(
		code,
		warehouse,
		posting_date or today(),
		nowtime(),
		batch_no=batch_no or None,
		company=company,
	)
	out.update({
		"qty": flt(balance.get("qty")),
		"rate": flt(balance.get("rate")),
		"serial_nos": balance.get("serial_nos") or "",
	})
	return out
