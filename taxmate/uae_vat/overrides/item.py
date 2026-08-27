"""Item validation for UAE HS / SAC codes."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_e_invoicing.constants import (
	ITEM_TYPE_BOTH,
	ITEM_TYPE_GOODS,
	ITEM_TYPE_SERVICE,
)


def validate(doc, method=None):
	"""Soft-validate HS/SAC by UAE Item Type; strict when e-invoicing is on."""
	item_type = doc.get("uae_item_type")
	if not item_type:
		return

	strict = _any_uae_company_e_invoice_enabled()

	needs_hs = item_type in (ITEM_TYPE_GOODS, ITEM_TYPE_BOTH)
	needs_sac = item_type in (ITEM_TYPE_SERVICE, ITEM_TYPE_BOTH)

	if needs_hs and not doc.get("hs_code"):
		msg = _("HS Code is required for {0} items when UAE e-invoicing is enabled.").format(
			item_type
		)
		if strict:
			frappe.throw(msg)
		else:
			frappe.msgprint(msg, indicator="orange", alert=True)

	if needs_sac and not doc.get("sac_code"):
		msg = _("SAC Code is required for {0} items when UAE e-invoicing is enabled.").format(
			item_type
		)
		if strict:
			frappe.throw(msg)
		else:
			frappe.msgprint(msg, indicator="orange", alert=True)


def _any_uae_company_e_invoice_enabled() -> bool:
	if not frappe.db.has_column("Company", "uae_e_invoice_enabled"):
		return False
	return bool(
		frappe.db.exists(
			"Company",
			{"country": UAE_COUNTRY, "uae_e_invoice_enabled": 1},
		)
	)
