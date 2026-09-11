"""Purchase Invoice hooks for UAE VAT 201 Box 9 recoverability."""

from __future__ import annotations

import frappe
from frappe.utils import flt

from taxmate.uae.constants import UAE_COUNTRY


def validate(doc, method=None):
	default_recoverable_standard_rated_expenses(doc)


def default_recoverable_standard_rated_expenses(doc) -> None:
	"""Default Box 9 recoverable VAT from purchase tax rows when blank.

	FTA VAT 201 Box 9 uses ``recoverable_standard_rated_expenses``. ERPNext does
	not auto-fill it; leaving it blank silently under-reports Box 9. For UAE
	companies, when reverse charge is not used and the field is empty, default
	to the sum of Purchase Taxes posted to UAE VAT accounts (100% recoverable
	assumption — operators can still reduce the field for blocked input tax).
	"""
	if getattr(doc, "flags", None) and doc.flags.get("skip_uae_vat_defaults"):
		return

	company = doc.get("company")
	if not company:
		return
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		return
	if not hasattr(doc, "recoverable_standard_rated_expenses"):
		return
	if doc.get("reverse_charge") == "Y":
		return
	if flt(doc.get("recoverable_standard_rated_expenses")):
		return

	vat_accounts = frappe.get_all(
		"UAE VAT Account",
		filters={"parent": company},
		pluck="account",
	)
	if not vat_accounts:
		return

	vat_accounts = set(vat_accounts)
	recoverable = 0.0
	for row in doc.get("taxes") or []:
		if row.get("account_head") in vat_accounts:
			recoverable += flt(row.get("base_tax_amount"))

	if recoverable:
		doc.recoverable_standard_rated_expenses = recoverable
