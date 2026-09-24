"""Feature-flag API for the TaxMate SPA industry packs.

Callers: taxmate.api catalog action get_feature_flags; frontend METHOD.getFeatureFlags,
AppShell buildNav. Schema: TaxMate Settings (Single) — optional toggles; also
detects installed apps (pos_next) for POSNext sidebar link and Team add-on roles.
User: "Check if we have installed POSNext... add it to frontend... roles could be
multiple select... union of permissions."
"""

from __future__ import annotations

import frappe

from taxmate.api.resource import require_login
from taxmate.setup.spa_roles import available_addon_roles


@frappe.whitelist()
def get_feature_flags() -> dict:
	"""Return feature flags for optional SPA modules and installed add-ons."""
	require_login()

	installed = set(frappe.get_installed_apps())
	pos_next = "pos_next" in installed

	flags: dict = {
		"enable_pos": True,
		"enable_serial": True,
		"enable_loyalty": True,
		"enable_bom": True,
		"enable_assets": True,
		"enable_pick_list": True,
		"enable_pos_next": pos_next,
		"pos_next_url": "/pos" if pos_next else None,
		"addon_roles": available_addon_roles() if pos_next else [],
	}

	try:
		if frappe.has_permission("TaxMate Settings", "read"):
			doc = frappe.get_single("TaxMate Settings")
			# Future: map real flag fields here, e.g.:
			# flags["enable_pos"] = bool(doc.get("enable_pos", True))
			_ = doc
	except Exception:
		pass

	return flags
