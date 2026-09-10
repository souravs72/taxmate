"""Ensure TaxMate product workspaces (Settings, Email, Automation, Notifications)."""

from __future__ import annotations

from pathlib import Path

import frappe
from frappe.modules.import_file import import_file_by_path


WORKSPACE_FILES = (
	"taxmate_settings/taxmate_settings.json",
	"email/email.json",
	"automation/automation.json",
	"notifications/notifications.json",
)

PRODUCT_WORKSPACES = (
	"TaxMate Settings",
	"Email",
	"Automation",
	"Notifications",
)


def ensure_product_workspaces() -> None:
	"""Import product workspaces, keep them visible, and hide ERPNext Settings."""
	base = Path(frappe.get_app_path("taxmate")) / "taxmate" / "workspace"
	for rel in WORKSPACE_FILES:
		path = base / rel
		if not path.exists():
			continue
		import_file_by_path(str(path), force=True, ignore_version=True)

	for name in PRODUCT_WORKSPACES:
		if frappe.db.exists("Workspace", name):
			frappe.db.set_value(
				"Workspace",
				name,
				{"is_hidden": 0, "public": 1, "title": name},
				update_modified=False,
			)

	# Replace ERPNext-branded settings workspace — no ERPNext label on TaxMate sites
	if frappe.db.exists("Workspace", "ERPNext Settings"):
		frappe.db.set_value(
			"Workspace",
			"ERPNext Settings",
			{"is_hidden": 1, "public": 0},
			update_modified=False,
		)

	frappe.clear_cache()
