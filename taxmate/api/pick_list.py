"""Pick List mappers for the TaxMate SPA.

Callers: taxmate.api catalog (__init__.py); frontend METHOD.makePickListFromDN.
Schema: Pick List — purpose (Select), customer (Link), delivery_note (Link),
  locations table: item_code, qty, qty_picked, warehouse, batch_no, serial_no.
User: "Implement the plan… complete all the to-dos."
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_allowed_doctype, require_login


@frappe.whitelist()
def make_pick_list_from_dn(source_name: str) -> dict[str, Any]:
    """Return an unsaved Pick List mapped from the given Delivery Note."""
    require_login()
    assert_allowed_doctype("Delivery Note")
    assert_allowed_doctype("Pick List")
    if not frappe.has_permission("Delivery Note", "read", source_name):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    from erpnext.stock.doctype.pick_list.pick_list import create_pick_list

    doc = create_pick_list(source_name)
    return doc.as_dict()


@frappe.whitelist(methods=["POST", "PUT"])
def set_item_locations(name: str) -> dict[str, Any]:
    """Re-fetch item locations for a Pick List."""
    require_login()
    assert_allowed_doctype("Pick List")
    if not frappe.has_permission("Pick List", "write", name):
        frappe.throw(_("Not permitted"), frappe.PermissionError)
    doc = frappe.get_doc("Pick List", name)
    doc.set_item_locations()
    doc.save()
    return doc.as_dict()
