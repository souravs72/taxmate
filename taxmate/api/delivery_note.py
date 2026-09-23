"""Delivery Note mappers for the TaxMate SPA.

ERPNext's DN → Sales Invoice mapper accepts ``target_doc`` and ``args`` off the
wire. This wrapper takes only the source name, checks permissions, and returns
an unsaved document for ``taxmate.api.resource.insert``.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt

from taxmate.api.resource import _as_data, assert_allowed_doctype, require_login


def _require_name(source_name: str, doctype: str) -> str:
	name = (source_name or "").strip()
	if not name:
		frappe.throw(_("{0} is required").format(doctype))
	return name


@frappe.whitelist(methods=["POST"])
def make_sales_invoice(source_name: str) -> dict[str, Any]:
	"""Map a submitted Delivery Note to an unsaved Sales Invoice."""
	require_login()
	name = _require_name(source_name, "Delivery Note")
	assert_allowed_doctype("Delivery Note")
	assert_allowed_doctype("Sales Invoice")

	doc = frappe.get_doc("Delivery Note", name)
	doc.check_permission("read")
	if cint(doc.docstatus) != 1:
		frappe.throw(_("Submit the Delivery Note before creating a Sales Invoice."))
	if not frappe.has_permission("Sales Invoice", "create"):
		frappe.throw(_("Not permitted to create {0}").format(_("Sales Invoice")), frappe.PermissionError)
	if flt(doc.get("per_billed")) >= 100:
		frappe.throw(
			_("Nothing left on {0} to put on a {1}.").format(name, _("Sales Invoice")),
			title=_("Already Complete"),
		)

	from erpnext.stock.doctype.delivery_note.delivery_note import (
		make_sales_invoice as erp_make_sales_invoice,
	)

	return _as_data(erp_make_sales_invoice(name, target_doc=None, args=None))
