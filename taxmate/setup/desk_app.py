"""Put TaxMate on the desk app grid, linking to the SPA."""

from __future__ import annotations

LOGO_URL = "/assets/taxmate/logo.svg"
SPA_ROUTE = "/taxmate"


def ensure_taxmate_desktop_icon() -> None:
	import frappe
	from frappe.desk.doctype.desktop_icon.desktop_icon import (
		clear_desktop_icons_cache,
		create_desktop_icons_from_installed_apps,
	)

	create_desktop_icons_from_installed_apps()
	name = frappe.db.get_value("Desktop Icon", {"icon_type": "App", "app": "taxmate"}, "name")
	if not name:
		return
	frappe.db.set_value(
		"Desktop Icon",
		name,
		{"link": SPA_ROUTE, "logo_url": LOGO_URL, "hidden": 0, "label": "TaxMate"},
		update_modified=False,
	)
	clear_desktop_icons_cache()
