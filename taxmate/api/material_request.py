"""Material Request mappers for the TaxMate SPA."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_allowed_doctype, require_login


@frappe.whitelist()
def make_purchase_order(source_name: str) -> dict[str, Any]:
	"""Return an unsaved Purchase Order mapped from the given Material Request."""
	require_login()
	assert_allowed_doctype("Material Request")
	assert_allowed_doctype("Purchase Order")
	if not frappe.has_permission("Material Request", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	from erpnext.stock.doctype.material_request.material_request import make_purchase_order as _make

	doc = _make(source_name)
	return doc.as_dict()


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
