"""Sales Invoice hooks for UAE VAT (place of supply, credit notes)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint, flt

from taxmate.uae_vat.utils.period_lock import validate_period_lock
from taxmate.uae_vat.utils.place_of_supply import validate_sales_invoice
from taxmate.uae_vat.utils.special_regime_ledger import apply_margin_on_item


def validate(doc, method=None):
	validate_sales_invoice(doc)
	validate_period_lock(doc)
	_apply_establishment(doc)
	_apply_margin_scheme(doc)


def _apply_establishment(doc):
	if not hasattr(doc, "uae_establishment") or not frappe.db.exists("DocType", "UAE Establishment"):
		return
	if not doc.get("uae_establishment"):
		head = frappe.db.get_value(
			"UAE Establishment", {"company": doc.company, "is_head_office": 1}, "name"
		)
		if head:
			doc.uae_establishment = head
		return
	est_company = frappe.db.get_value("UAE Establishment", doc.uae_establishment, "company")
	if est_company and est_company != doc.company:
		frappe.throw(_("Establishment {0} belongs to {1}.").format(doc.uae_establishment, est_company))


def _apply_margin_scheme(doc):
	flags = []
	for item in doc.get("items") or []:
		if not hasattr(item, "uae_is_margin_scheme"):
			continue
		apply_margin_on_item(item)
		flags.append(cint(item.uae_is_margin_scheme))
		if cint(item.uae_is_margin_scheme) and flt(item.get("uae_purchase_price")) < 0:
			frappe.throw(_("Row #{0}: purchase price cannot be negative.").format(item.idx))
		if cint(item.uae_is_margin_scheme) and item.get("uae_purchase_price") in (None, ""):
			frappe.throw(
				_("Row #{0}: set the purchase price for margin-scheme items.").format(item.idx)
			)
	if flags and any(flags) and not all(flags):
		frappe.throw(
			_(
				"Do not mix margin-scheme items with other items on the same Sales Invoice. "
				"Split the supply so Box 1 replaces consideration with the taxable margin."
			),
			title=_("Mixed Margin Scheme"),
		)


def before_cancel(doc, method=None):
	validate_period_lock(doc)
