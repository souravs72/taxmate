"""Purchase Receipt mappers for the TaxMate SPA.

Wraps ERPNext PR → Purchase Invoice. Result is unsaved; insert then submit.
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
def make_purchase_invoice(source_name: str) -> dict[str, Any]:
	"""Map a submitted Purchase Receipt to an unsaved Purchase Invoice."""
	require_login()
	name = _require_name(source_name, "Purchase Receipt")
	assert_allowed_doctype("Purchase Receipt")
	assert_allowed_doctype("Purchase Invoice")

	doc = frappe.get_doc("Purchase Receipt", name)
	doc.check_permission("read")
	if cint(doc.docstatus) != 1:
		frappe.throw(_("Submit the Purchase Receipt before creating a Purchase Invoice."))
	if not frappe.has_permission("Purchase Invoice", "create"):
		frappe.throw(
			_("Not permitted to create {0}").format(_("Purchase Invoice")),
			frappe.PermissionError,
		)
	if flt(doc.get("per_billed")) >= 100:
		frappe.throw(
			_("Nothing left on {0} to put on a {1}.").format(name, _("Purchase Invoice")),
			title=_("Already Complete"),
		)

	from erpnext.stock.doctype.purchase_receipt.purchase_receipt import (
		make_purchase_invoice as erp_make_purchase_invoice,
	)

	return _as_data(erp_make_purchase_invoice(name, target_doc=None, args=None))
