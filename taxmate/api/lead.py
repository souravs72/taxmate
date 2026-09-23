"""Lead helpers (Phase 21).

Converts a Lead to a Customer. Catalogued in taxmate.api.get_catalog().
"""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.api.resource import require_login


@frappe.whitelist()
def convert_to_customer(lead_name: str) -> dict:
	"""Convert a Lead to a Customer (draft) and return the Customer doc."""
	require_login()
	if not frappe.has_permission("Lead", "write", lead_name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from erpnext.crm.doctype.lead.lead import _make_customer

	customer = _make_customer(lead_name, ignore_permissions=False)
	return customer.as_dict()
