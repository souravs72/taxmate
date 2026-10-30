"""Mapped-document tax, matching ERPNext Desk Create → Invoice.

Callers: taxmate.uae_vat.overrides.purchase_invoice.PurchaseInvoiceReverseCharge.set_taxes,
taxmate.uae_vat.overrides.sales_invoice.SalesInvoiceMappedTaxes.set_taxes,
taxmate.api.purchase_order.make_purchase_invoice, taxmate.api.purchase_receipt.make_purchase_invoice,
taxmate.api.sales_order.make_sales_invoice, taxmate.api.delivery_note.make_sales_invoice.

frappe.model.mapper.get_mapped_doc sets __onload.load_after_mapping.
erpnext.public.js.controllers.transaction.onload_post_render then skips
apply_default_taxes. AccountsController.set_taxes still stamps the company
default on save when taxes is empty. Skip only that stamp when every linked
source has no template and a zero tax total. Leave set_taxes_and_charges
alone so item tax templates still apply.
"""

from __future__ import annotations

import frappe
from frappe.utils import flt

_SOURCE_LINKS = {
	"Purchase Invoice": (
		("Purchase Order", "purchase_order"),
		("Purchase Receipt", "purchase_receipt"),
	),
	"Sales Invoice": (
		("Sales Order", "sales_order"),
		("Delivery Note", "delivery_note"),
	),
}


def skip_default_taxes_after_mapping(doc) -> bool:
	"""True when this invoice was mapped from sources that themselves had no tax."""
	if doc.get("taxes") or doc.get("taxes_and_charges"):
		return False
	pairs = _SOURCE_LINKS.get(doc.doctype)
	if not pairs:
		return False
	seen: set[tuple[str, str]] = set()
	found = False
	for row in doc.get("items") or []:
		for doctype, fieldname in pairs:
			name = row.get(fieldname)
			if not name:
				continue
			key = (doctype, str(name))
			if key in seen:
				continue
			seen.add(key)
			found = True
			vals = frappe.db.get_value(doctype, name, ["taxes_and_charges", "total_taxes_and_charges"])
			if not vals:
				return False
			template, total = vals
			if template or flt(total):
				return False
	return found


def keep_source_tax(source, mapped) -> None:
	"""Mapped doc keeps the source tax, including none.

	ERPNext set_missing_values recalculates totals but does not stamp the
	company default. Insert later would, via AccountsController.set_taxes.
	"""
	if source.get("taxes_and_charges") or source.get("taxes"):
		return
	mapped.taxes_and_charges = ""
	mapped.set("taxes", [])
	if hasattr(mapped, "calculate_taxes_and_totals"):
		mapped.calculate_taxes_and_totals()
