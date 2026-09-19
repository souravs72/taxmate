"""Phase 2 TaxMate Settings: lock filed VAT 201 periods."""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return
	from taxmate.uae.validation import singles_field_is_set

	if not singles_field_is_set("block_invoices_in_filed_vat_period"):
		frappe.db.set_single_value("TaxMate Settings", "block_invoices_in_filed_vat_period", 1)
	if not singles_field_is_set("vat_201_reminder_days"):
		frappe.db.set_single_value("TaxMate Settings", "vat_201_reminder_days", 7)
	frappe.clear_cache(doctype="TaxMate Settings")
