"""Phase 4: create UAE CT Settings for existing UAE companies."""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.exists("DocType", "UAE CT Settings"):
		return
	from taxmate.uae_corporate_tax.setup import bootstrap_existing_uae_companies

	bootstrap_existing_uae_companies()
	frappe.clear_cache(doctype="UAE CT Settings")
