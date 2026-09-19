"""Set Phase 1 TaxMate Settings Checks on existing Singles.

JSON defaults do not backfill tabSingles. Check values are 0/1, never None,
so install.py ``is None`` never applied. This patch writes the product defaults
once; operators can turn them off afterwards.
"""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return

	for field, default in (
		("enforce_credit_note_reference", 1),
		("require_vat_emirate_on_invoice", 1),
		("block_e_invoice_until_ready", 1),
	):
		frappe.db.set_single_value("TaxMate Settings", field, default)

	frappe.clear_cache(doctype="TaxMate Settings")
