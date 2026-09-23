"""Supplier Quotation helpers (Phase 16).

Maps a submitted Supplier Quotation to a draft Purchase Order.
Catalogued in taxmate.api.get_catalog() as make_supplier_quotation_po.
"""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.api.resource import require_login


@frappe.whitelist()
def make_purchase_order(source_name: str) -> dict:
	"""Map a submitted Supplier Quotation to a draft Purchase Order."""
	require_login()
	if not frappe.has_permission("Supplier Quotation", "read", source_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from erpnext.buying.doctype.supplier_quotation.supplier_quotation import make_purchase_order as _make_po

	po = _make_po(source_name)
	return po.as_dict()
