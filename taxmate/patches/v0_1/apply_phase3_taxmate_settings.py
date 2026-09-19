"""Phase 3 UAE Tax Settings: B2C exclusion and 14-day SLA defaults."""

from __future__ import annotations

import frappe


def _singles_set(fieldname: str) -> bool:
	return bool(frappe.db.exists("Singles", {"doctype": "UAE Tax Settings", "field": fieldname}))


def execute():
	if not frappe.db.exists("DocType", "UAE Tax Settings"):
		return
	if not _singles_set("exclude_b2c_e_invoices"):
		frappe.db.set_single_value("UAE Tax Settings", "exclude_b2c_e_invoices", 1)
	if not _singles_set("auto_draft_incoming_pi"):
		frappe.db.set_single_value("UAE Tax Settings", "auto_draft_incoming_pi", 0)
	if not _singles_set("sla_days"):
		frappe.db.set_single_value("UAE Tax Settings", "sla_days", 14)
	if not _singles_set("archive_retention_years"):
		frappe.db.set_single_value("UAE Tax Settings", "archive_retention_years", 5)
	if not _singles_set("uae_storage_note"):
		frappe.db.set_single_value(
			"UAE Tax Settings",
			"uae_storage_note",
			"Prefer UAE-hosted File storage for signed e-invoice XML/PDF. TaxMate does not move files off-site.",
		)
	frappe.clear_cache(doctype="UAE Tax Settings")
