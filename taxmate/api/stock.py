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


@frappe.whitelist()
def get_warehouse_stock(warehouse: str) -> dict[str, Any]:
	"""Return inventory items, summary metrics, low-stock items, and recent movements for a warehouse."""
	require_login()
	warehouse = (warehouse or "").strip()
	if not warehouse:
		frappe.throw(_("Warehouse is required"))
	assert_allowed_doctype("Warehouse")
	if not frappe.has_permission("Warehouse", "read", warehouse):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	wh_doc = frappe.get_doc("Warehouse", warehouse)
	assert_company_read(wh_doc.company)

	bins = frappe.db.sql(
		"""
		SELECT
			b.item_code,
			i.item_name,
			i.item_group,
			i.stock_uom,
			i.weight_per_unit,
			i.weight_uom,
			b.actual_qty,
			b.valuation_rate,
			b.stock_value,
			r.warehouse_reorder_level
		FROM `tabBin` b
		JOIN `tabItem` i ON i.name = b.item_code
		LEFT JOIN `tabItem Reorder` r ON r.parent = b.item_code AND r.warehouse = b.warehouse
		WHERE b.warehouse = %s AND b.actual_qty != 0
		ORDER BY b.stock_value DESC, b.item_code ASC
		""",
		(warehouse,),
		as_dict=True,
	)

	import re

	items_list: list[dict[str, Any]] = []
	total_qty = 0.0
	total_value = 0.0
	total_weight = 0.0
	purity_weights_map: dict[str, float] = {}
	low_stock_items: list[dict[str, Any]] = []

	purity_pattern = re.compile(r"\b(24K|22K|21K|18K|14K|10K|9K|925|999|Silver|Platinum|Diamond)\b", re.IGNORECASE)

	for b in bins:
		qty = flt(b.actual_qty)
		rate = flt(b.valuation_rate)
		val = flt(b.stock_value) or (qty * rate)
		weight_unit = flt(b.weight_per_unit)
		line_weight = qty * weight_unit if weight_unit else 0.0
		reorder_level = flt(b.warehouse_reorder_level) if b.warehouse_reorder_level is not None else None

		purity_match = purity_pattern.search(b.item_name or "") or purity_pattern.search(b.item_code or "")
		purity = purity_match.group(1).upper() if purity_match else "—"

		is_low = reorder_level is not None and reorder_level > 0 and qty <= reorder_level

		items_list.append({
			"item_code": b.item_code,
			"item_name": b.item_name or b.item_code,
			"item_group": b.item_group or "",
			"stock_uom": b.stock_uom or "Nos",
			"actual_qty": qty,
			"valuation_rate": rate,
			"stock_value": val,
			"weight_per_unit": weight_unit,
			"weight": line_weight,
			"purity": purity,
			"reorder_level": reorder_level,
			"is_low_stock": is_low,
		})

		total_qty += qty
		total_value += val
		total_weight += line_weight

		if purity != "—" and line_weight > 0:
			purity_weights_map[purity] = purity_weights_map.get(purity, 0.0) + line_weight

		if is_low:
			low_stock_items.append({
				"item_code": b.item_code,
				"item_name": b.item_name or b.item_code,
				"actual_qty": qty,
				"reorder_level": reorder_level,
				"uom": b.stock_uom or "Nos",
			})

	low_stock_items.sort(key=lambda x: (x["reorder_level"] - x["actual_qty"]), reverse=True)

	purity_breakdown = [
		{"purity": k, "weight": round(v, 2)}
		for k, v in sorted(purity_weights_map.items(), key=lambda x: x[0], reverse=True)
	]

	movements = frappe.db.sql(
		"""
		SELECT
			sle.posting_date,
			sle.voucher_type,
			sle.voucher_no,
			sle.item_code,
			i.item_name,
			sle.actual_qty,
			sle.qty_after_transaction
		FROM `tabStock Ledger Entry` sle
		JOIN `tabItem` i ON i.name = sle.item_code
		WHERE sle.warehouse = %s AND sle.is_cancelled = 0
		ORDER BY sle.posting_date DESC, sle.posting_time DESC, sle.creation DESC
		LIMIT 10
		""",
		(warehouse,),
		as_dict=True,
	)

	recent_movements = []
	for m in movements:
		recent_movements.append({
			"posting_date": str(m.posting_date),
			"voucher_type": m.voucher_type,
			"voucher_no": m.voucher_no,
			"item_code": m.item_code,
			"item_name": m.item_name or m.item_code,
			"actual_qty": flt(m.actual_qty),
			"qty_after_transaction": flt(m.qty_after_transaction),
		})

	return {
		"warehouse": {
			"name": wh_doc.name,
			"warehouse_name": wh_doc.warehouse_name,
			"company": wh_doc.company,
			"parent_warehouse": wh_doc.parent_warehouse,
			"account": wh_doc.account,
			"is_group": wh_doc.is_group,
			"disabled": wh_doc.disabled,
		},
		"summary": {
			"items_count": len(items_list),
			"total_qty": total_qty,
			"total_value": total_value,
			"total_weight": total_weight,
			"purity_breakdown": purity_breakdown,
		},
		"items": items_list,
		"low_stock_items": low_stock_items,
		"recent_movements": recent_movements,
	}

