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

# Workspace *name* must not equal a DocType name — Desk routes prefer Workspace
# over DocType for the same slug (frappe/public/js/frappe/router.js).
PRODUCT_WORKSPACES = (
	"App Settings",
	"Email",
	"Automation",
	"Notifications",
)

# Sidebar title for App Settings (shown as TaxMate Settings)
WORKSPACE_TITLES = {
	"App Settings": "TaxMate Settings",
}


def ensure_product_workspaces() -> None:
	"""Import product workspaces, keep them visible, and hide ERPNext Settings."""
	_retire_colliding_taxmate_settings_workspace()

	base = Path(frappe.get_app_path("taxmate")) / "taxmate" / "workspace"
	for rel in WORKSPACE_FILES:
		path = base / rel
		if not path.exists():
			continue
		import_file_by_path(str(path), force=True, ignore_version=True)

	for name in PRODUCT_WORKSPACES:
		if not frappe.db.exists("Workspace", name):
			continue
		values = {"is_hidden": 0, "public": 1}
		if name in WORKSPACE_TITLES:
			values["title"] = WORKSPACE_TITLES[name]
		frappe.db.set_value("Workspace", name, values, update_modified=False)

	if frappe.db.exists("Workspace", "ERPNext Settings"):
		frappe.db.set_value(
			"Workspace",
			"ERPNext Settings",
			{"is_hidden": 1, "public": 0},
			update_modified=False,
		)

	from taxmate.setup.home import ensure_uae_home_workspace

	ensure_uae_home_workspace()
	frappe.clear_cache()


def _retire_colliding_taxmate_settings_workspace() -> None:
	"""Remove Workspace named like the TaxMate Settings DocType (route collision).

	Clicking a DocType shortcut builds ``/desk/taxmate-settings/...``; if a
	Workspace owns that slug, the router opens the Workspace instead of Form.
	"""
	if not frappe.db.exists("Workspace", "TaxMate Settings"):
		return
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return
	frappe.delete_doc("Workspace", "TaxMate Settings", force=True, ignore_permissions=True)
