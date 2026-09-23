"""Feature-flag API for the TaxMate SPA industry packs.

Callers: taxmate.api catalog action get_feature_flags; frontend METHOD.getFeatureFlags.
Schema: TaxMate Settings (Single) — default_country, enforce_trn_validation, etc.
  No enable_* toggle fields exist yet; returns all-enabled defaults.
User: "Implement the plan… complete all the to-dos."
"""

from __future__ import annotations

import frappe

from taxmate.api.resource import require_login


@frappe.whitelist()
def get_feature_flags() -> dict[str, bool]:
    """Return feature flags for optional SPA modules.

    All flags default to True so every module is visible.
    Extend when TaxMate Settings gains real toggle fields.
    """
    require_login()

    flags: dict[str, bool] = {
        "enable_pos": True,
        "enable_serial": True,
        "enable_loyalty": True,
        "enable_bom": True,
        "enable_assets": True,
        "enable_pick_list": True,
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
