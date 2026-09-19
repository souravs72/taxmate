"""Ensure TaxMate product workspaces (Settings, Email, Automation, Notifications)."""

from __future__ import annotations

import json
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

	_ensure_invoice_ocr_workspace()
	_ensure_idp_clerk_defaults()
	_ensure_users_workspace()
	_ensure_settings_operator_shortcuts()
	ensure_idp_user_access()

	from taxmate.setup.financial_reports import ensure_financial_reports_nav
	from taxmate.setup.home import ensure_uae_home_workspace

	ensure_uae_home_workspace()
	ensure_financial_reports_nav()
	frappe.clear_cache()


def _retire_colliding_taxmate_settings_workspace() -> None:
	"""Remove Workspace named like the TaxMate Settings DocType (route collision).

	Clicking a DocType shortcut builds ``/app/taxmate-settings/...``; if a
	Workspace owns that slug, the router opens the Workspace instead of Form.
	"""
	if not frappe.db.exists("Workspace", "TaxMate Settings"):
		return
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return
	frappe.delete_doc("Workspace", "TaxMate Settings", force=True, ignore_permissions=True)


def _ensure_invoice_ocr_workspace() -> None:
	"""Public Invoice OCR workspace: Scan bill + draft Purchase Invoices only."""
	if not frappe.db.exists("Workspace", "IDP"):
		return
	frappe.db.set_value(
		"Workspace",
		"IDP",
		{"is_hidden": 0, "public": 1, "title": "Invoice OCR"},
		update_modified=False,
	)
	shortcuts = (
		{"label": "Scan bill", "type": "URL", "url": "/idp/chat", "color": "#12715B"},
		{
			"label": "Draft Purchase Invoices",
			"type": "DocType",
			"link_to": "Purchase Invoice",
			"doc_view": "List",
			"color": "#f39c12",
			"stats_filter": json.dumps([["Purchase Invoice", "docstatus", "=", 0]]),
			"format": "{} Draft",
		},
		{"label": "Items", "type": "DocType", "link_to": "Item", "doc_view": "List"},
	)
	_replace_workspace_shortcuts(
		"IDP",
		shortcuts,
		"tm_ocr",
		"Scan a supplier bill",
		clear_number_cards=True,
	)


def _ensure_idp_clerk_defaults() -> None:
	"""Safe IDP Settings for clerks: auto language, no new masters, no cost chrome."""
	if not frappe.db.exists("DocType", "IDP Settings"):
		return
	doc = frappe.get_single("IDP Settings")
	changed = False
	defaults = {
		"default_ocr_language": "auto",
		"auto_create_missing_masters": 0,
		"enable_write_operations": 0,
		"enable_cost_footer": 0,
		"enable_bulk_actions": 0,
	}
	for field, value in defaults.items():
		if not hasattr(doc, field):
			continue
		if doc.get(field) != value:
			doc.set(field, value)
			changed = True
	if changed:
		doc.flags.ignore_permissions = True
		doc.save()


USERS_ACCESS_SHORTCUTS: tuple[dict[str, str], ...] = (
	{"label": "User", "type": "DocType", "link_to": "User", "doc_view": "List", "color": "#12715B"},
	{"label": "Role", "type": "DocType", "link_to": "Role", "doc_view": "List"},
	{"label": "Role Profile", "type": "DocType", "link_to": "Role Profile", "doc_view": "List"},
	{"label": "User Permission", "type": "DocType", "link_to": "User Permission", "doc_view": "List"},
	{"label": "Module Profile", "type": "DocType", "link_to": "Module Profile", "doc_view": "List"},
)

SETTINGS_ACCESS_SHORTCUTS: tuple[dict[str, str], ...] = (
	{"label": "User", "type": "DocType", "link_to": "User", "doc_view": "List", "color": "#12715B"},
	{"label": "Role", "type": "DocType", "link_to": "Role", "doc_view": "List"},
	{"label": "IDP Settings", "type": "DocType", "link_to": "IDP Settings", "doc_view": "List"},
)

IDP_ACCESS_ROLES: tuple[str, ...] = ("System Manager", "Accounts Manager", "Accounts User")


def _ensure_users_workspace() -> None:
	"""Show the Core Users workspace and pin User / Role shortcuts on it."""
	if not frappe.db.exists("Workspace", "Users"):
		return
	frappe.db.set_value("Workspace", "Users", {"is_hidden": 0, "public": 1}, update_modified=False)
	_upsert_workspace_shortcuts("Users", USERS_ACCESS_SHORTCUTS, "tm_users", "Users & access")


def _ensure_settings_operator_shortcuts() -> None:
	"""User / Role / IDP Settings on TaxMate Settings (App Settings)."""
	if not frappe.db.exists("Workspace", "App Settings"):
		return
	_upsert_workspace_shortcuts("App Settings", SETTINGS_ACCESS_SHORTCUTS, "tm_access", "Users & access")


def ensure_idp_user_access() -> None:
	"""Grant IDP User to desk accounts/system managers so Invoice OCR DocTypes open."""
	if not frappe.db.exists("Role", "IDP User"):
		return
	parents = frappe.get_all(
		"Has Role",
		filters={"role": ["in", list(IDP_ACCESS_ROLES)], "parenttype": "User"},
		pluck="parent",
	)
	for name in set(parents):
		if name == "Guest" or not frappe.db.exists("User", name):
			continue
		enabled, user_type = frappe.db.get_value("User", name, ["enabled", "user_type"])
		if not enabled or user_type != "System User":
			continue
		if frappe.db.exists("Has Role", {"parent": name, "parenttype": "User", "role": "IDP User"}):
			continue
		frappe.get_doc(
			{
				"doctype": "Has Role",
				"parent": name,
				"parenttype": "User",
				"parentfield": "roles",
				"role": "IDP User",
			}
		).insert(ignore_permissions=True)
		frappe.clear_cache(user=name)


def _replace_workspace_shortcuts(
	workspace: str,
	wanted: tuple[dict, ...],
	block_prefix: str,
	header: str,
	clear_number_cards: bool = False,
) -> None:
	rows: list[dict] = []
	for row in wanted:
		row = dict(row)
		if row.get("type") == "URL":
			if row.get("url"):
				rows.append(row)
			continue
		if row.get("link_to") and frappe.db.exists("DocType", row["link_to"]):
			rows.append(row)
	if not rows:
		return

	ws = frappe.get_doc("Workspace", workspace)
	ws.shortcuts = []
	for row in rows:
		ws.append("shortcuts", row)
	if clear_number_cards:
		ws.number_cards = []

	blocks: list[dict] = [
		{
			"id": f"{block_prefix}_hdr",
			"type": "header",
			"data": {"text": f'<span class="h4"><b>{header}</b></span>', "col": 12},
		}
	]
	for i, row in enumerate(rows):
		blocks.append(
			{
				"id": f"{block_prefix}_s{i}",
				"type": "shortcut",
				"data": {"shortcut_name": row["label"], "col": 3},
			}
		)
	ws.content = json.dumps(blocks)

	was = frappe.flags.in_patch
	frappe.flags.in_patch = True
	try:
		if not ws.get("type"):
			ws.type = "Workspace"
		ws.flags.ignore_permissions = True
		ws.flags.ignore_mandatory = True
		ws.save()
	finally:
		frappe.flags.in_patch = was


def _upsert_workspace_shortcuts(
	workspace: str,
	wanted: tuple[dict[str, str], ...],
	block_prefix: str,
	header: str,
) -> None:
	rows = [dict(row) for row in wanted if frappe.db.exists("DocType", row["link_to"])]
	if not rows:
		return

	ws = frappe.get_doc("Workspace", workspace)
	existing = {s.label for s in ws.shortcuts}
	changed = False
	for row in rows:
		if row["label"] in existing:
			continue
		ws.append("shortcuts", row)
		changed = True

	try:
		content = json.loads(ws.content or "[]")
		if not isinstance(content, list):
			content = []
	except Exception:
		content = []

	have = {block.get("data", {}).get("shortcut_name") for block in content if block.get("type") == "shortcut"}
	missing = [row for row in rows if row["label"] not in have]
	if missing:
		content = [block for block in content if not str(block.get("id") or "").startswith(block_prefix)]
		blocks: list[dict] = [
			{
				"id": f"{block_prefix}_hdr",
				"type": "header",
				"data": {"text": f'<span class="h4"><b>{header}</b></span>', "col": 12},
			}
		]
		for i, row in enumerate(rows):
			blocks.append(
				{
					"id": f"{block_prefix}_s{i}",
					"type": "shortcut",
					"data": {"shortcut_name": row["label"], "col": 3},
				}
			)
		ws.content = json.dumps(blocks + content)
		changed = True

	if changed:
		was = frappe.flags.in_patch
		frappe.flags.in_patch = True
		try:
			if not ws.get("type"):
				ws.type = "Workspace"
			ws.flags.ignore_permissions = True
			ws.flags.ignore_mandatory = True
			ws.save()
		finally:
			frappe.flags.in_patch = was
