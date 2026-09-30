"""Material Request mappers for the TaxMate SPA."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_allowed_doctype, require_login


@frappe.whitelist()
def make_purchase_order(source_name: str, supplier: str | None = None) -> dict[str, Any]:
	"""Return an unsaved Purchase Order mapped from the given Material Request.

	Supplier is optional. Desk leaves it blank when items share no default supplier.
	The purchase order form asks for it before save. Item rows keep the
	material request link.
	"""
	require_login()
	assert_allowed_doctype("Material Request")
	assert_allowed_doctype("Purchase Order")
	if not frappe.has_permission("Material Request", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	from erpnext.stock.doctype.material_request.material_request import make_purchase_order as _make

	args = {"supplier": supplier} if supplier else None
	doc = _make(source_name, args=args)
	return doc.as_dict()


@frappe.whitelist()
def get_item_default_suppliers(source_name: str) -> list[dict[str, Any]]:
	"""Pending material-request rows and each item's default supplier."""
	require_login()
	assert_allowed_doctype("Material Request")
	if not frappe.has_permission("Material Request", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	from erpnext.stock.doctype.material_request.material_request import (
		get_item_default_suppliers as _get,
	)

	return _get(source_name)


@frappe.whitelist()
def make_purchase_orders_by_supplier(source_name: str, item_suppliers=None) -> list[str]:
	"""Insert one draft Purchase Order per supplier. Returns the new names."""
	require_login()
	assert_allowed_doctype("Material Request")
	assert_allowed_doctype("Purchase Order")
	if not frappe.has_permission("Material Request", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if not frappe.has_permission("Purchase Order", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	from erpnext.stock.doctype.material_request.material_request import (
		make_purchase_orders_by_supplier as _make,
	)

	return _make(source_name, item_suppliers)


@frappe.whitelist()
def make_stock_entry(source_name: str) -> dict[str, Any]:
	"""Return an unsaved Stock Entry mapped from the given Material Request."""
	require_login()
	assert_allowed_doctype("Material Request")
	assert_allowed_doctype("Stock Entry")
	if not frappe.has_permission("Material Request", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	from erpnext.stock.doctype.material_request.material_request import make_stock_entry as _make

	doc = _make(source_name)
	return doc.as_dict()
