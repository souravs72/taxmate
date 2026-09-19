"""Phase 6: custom fields + excise rate defaults."""

from __future__ import annotations

import frappe


def execute():
	from taxmate.uae_vat.setup import setup

	setup()
	frappe.clear_cache(doctype="UAE Excise Settings")
	frappe.clear_cache(doctype="UAE Customs Declaration")
	frappe.clear_cache(doctype="UAE Bad Debt Relief")
