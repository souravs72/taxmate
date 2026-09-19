"""Phase 5: shareholder registers + licence-authority defaults."""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.exists("DocType", "UAE Shareholder Register"):
		return
	from taxmate.uae_compliance.setup import (
		bootstrap_existing_uae_companies,
		ensure_compliance_settings_defaults,
	)

	ensure_compliance_settings_defaults()
	bootstrap_existing_uae_companies()
	frappe.clear_cache(doctype="UAE Shareholder Register")
	frappe.clear_cache(doctype="UAE Compliance Settings")
