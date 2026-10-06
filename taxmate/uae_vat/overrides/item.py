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
from taxmate.utils.company import get_default_company


def validate(doc, method=None):
	"""Soft-validate HS/SAC by UAE Item Type; strict when e-invoicing is on."""
	assign_company(doc)
	item_type = doc.get("uae_item_type")
	if not item_type:
		return

	strict = _any_uae_company_e_invoice_enabled()

	needs_hs = item_type in (ITEM_TYPE_GOODS, ITEM_TYPE_BOTH)
	needs_sac = item_type in (ITEM_TYPE_SERVICE, ITEM_TYPE_BOTH)

	if needs_hs and not doc.get("hs_code"):
		msg = _("HS Code is required for {0} items when UAE e-invoicing is enabled.").format(item_type)
		if strict:
			frappe.throw(msg)
		else:
			frappe.msgprint(msg, indicator="orange", alert=True)

	if needs_sac and not doc.get("sac_code"):
		msg = _("SAC Code is required for {0} items when UAE e-invoicing is enabled.").format(item_type)
		if strict:
			frappe.throw(msg)
		else:
			frappe.msgprint(msg, indicator="orange", alert=True)


def assign_company(doc) -> None:
	"""POS Next lists an item only when Company matches the POS Profile.

	A blank Company is hidden while "Include Global Items" is off. Fill it from
	the item's company default, then the user's company, and leave an explicit value alone.
	"""
	if not getattr(doc, "meta", None) or not doc.meta.has_field("custom_company"):
		return
	if doc.get("custom_company"):
		return
	# Item Default is the company this SKU already posts to. Prefer that over
	# the logged-in user's company so a multi-company site does not stamp every
	# item onto whoever happens to save it.
	company = None
	for row in doc.get("item_defaults") or []:
		if row.get("company"):
			company = row.company
			break
	if not company:
		company = get_default_company() or frappe.defaults.get_global_default("Company")
	if company and frappe.db.exists("Company", company):
		doc.custom_company = company


def _any_uae_company_e_invoice_enabled() -> bool:
	if not frappe.db.has_column("Company", "uae_e_invoice_enabled"):
		return False
	return bool(
		frappe.db.exists(
			"Company",
			{"country": UAE_COUNTRY, "uae_e_invoice_enabled": 1},
		)
	)
