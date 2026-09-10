"""Ensure TaxMate Email / Automation / Notifications workspaces."""


from __future__ import annotations

from pathlib import Path

import frappe
from frappe.modules.import_file import import_file_by_path


WORKSPACE_FILES = (
	"email/email.json",
	"automation/automation.json",
	"notifications/notifications.json",
)


def ensure_product_workspaces() -> None:
	"""Import Email / Automation / Notifications workspaces and keep them visible."""
	base = Path(frappe.get_app_path("taxmate")) / "taxmate" / "workspace"
	for rel in WORKSPACE_FILES:
		path = base / rel
		if not path.exists():
			continue
		import_file_by_path(str(path), force=True, ignore_version=True)

	for name in ("Email", "Automation", "Notifications"):
		if frappe.db.exists("Workspace", name):
			frappe.db.set_value(
				"Workspace",
				name,
				{"is_hidden": 0, "public": 1},
				update_modified=False,
			)
	frappe.clear_cache()
