"""Phase 8: retention, late-filing notices, FTA audit pack, residency note."""

from __future__ import annotations

import frappe


def execute():
	from taxmate.install import _ensure_taxmate_settings_defaults
	from taxmate.uae_vat.setup import setup

	setup()
	_ensure_taxmate_settings_defaults()
	frappe.clear_cache(doctype="UAE FTA Audit Pack")
	frappe.clear_cache(doctype="UAE Late Filing Notice")
	frappe.clear_cache(doctype="TaxMate Settings")
