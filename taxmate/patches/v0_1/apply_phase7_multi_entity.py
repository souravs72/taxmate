"""Phase 7: VAT group, establishments, Tax Manager role, audit log."""

from __future__ import annotations

import frappe


def execute():
	from taxmate.uae_vat.setup import setup

	setup()
	frappe.clear_cache(doctype="UAE VAT Group")
	frappe.clear_cache(doctype="UAE Establishment")
	frappe.clear_cache(doctype="UAE VAT 201 Filing Log")
