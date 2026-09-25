"""Quotation→Sales Order mapper for the TaxMate SPA."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_allowed_doctype, require_login


@frappe.whitelist()
def make_sales_order(source_name: str) -> dict[str, Any]:
	"""Return an unsaved Sales Order mapped from the given Quotation."""
	require_login()
	assert_allowed_doctype("Quotation")
	assert_allowed_doctype("Sales Order")
	if not frappe.has_permission("Quotation", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	from erpnext.selling.doctype.quotation.quotation import make_sales_order as _make

	doc = _make(source_name)
	return doc.as_dict()
