"""Purchase Order mappers for the TaxMate SPA.

Wrap ERPNext PO → Purchase Receipt / Purchase Invoice mappers. The result is
unsaved; insert with taxmate.api.resource.insert, then submit.
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


def _assert_mappable(source_name: str, target_doctype: str, progress_field: str) -> str:
	name = _require_name(source_name, "Purchase Order")
	assert_allowed_doctype("Purchase Order")
	assert_allowed_doctype(target_doctype)

	doc = frappe.get_doc("Purchase Order", name)
	doc.check_permission("read")
	if cint(doc.docstatus) != 1:
		frappe.throw(_("Submit the Purchase Order before creating a downstream document."))
	if not frappe.has_permission(target_doctype, "create"):
		frappe.throw(
			_("Not permitted to create {0}").format(_(target_doctype)),
			frappe.PermissionError,
		)
	if flt(doc.get(progress_field)) >= 100:
		frappe.throw(
			_("Nothing left on {0} to put on a {1}.").format(name, _(target_doctype)),
			title=_("Already Complete"),
		)
	return name


@frappe.whitelist(methods=["POST"])
def make_purchase_receipt(source_name: str) -> dict[str, Any]:
	"""Map a submitted Purchase Order to an unsaved Purchase Receipt."""
	require_login()
	name = _assert_mappable(source_name, "Purchase Receipt", "per_received")
	from erpnext.buying.doctype.purchase_order.purchase_order import (
		make_purchase_receipt as erp_make_purchase_receipt,
	)

	return _as_data(erp_make_purchase_receipt(name, target_doc=None))


@frappe.whitelist(methods=["POST"])
def make_purchase_invoice(source_name: str) -> dict[str, Any]:
	"""Map a submitted Purchase Order to an unsaved Purchase Invoice."""
	require_login()
	name = _assert_mappable(source_name, "Purchase Invoice", "per_billed")
	from erpnext.buying.doctype.purchase_order.purchase_order import (
		make_purchase_invoice as erp_make_purchase_invoice,
	)

	return _as_data(erp_make_purchase_invoice(name, target_doc=None))
