"""DocType tab layout for the SPA — mirrors Desk Tab Breaks.

Callers:
- taxmate.api.get_catalog → action form_layout
- frontend METHOD.formLayout → DocTabs / detail screens
- taxmate.tests.test_form_layout

No existing module returns Tab Break order for the SPA (Glob/Grep: none).

Reads DocType meta only. Return shape:
  {"doctype": "Sales Order", "tabs": [{"id": "__details", "label": "Details",
   "fieldname": "__details", "fields": ["customer", ...]}, ...],
   "has_connections": true}
No dates, no file I/O.

User: "Implement the plan as specified, it is attached for your reference.
Do NOT edit the plan file itself. ... Don't stop until you have completed
all the to-dos."
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_allowed_doctype, require_login

_SKIP_TYPES = frozenset(
	{
		"Section Break",
		"Column Break",
		"Tab Break",
		"Fold",
		"Heading",
		"HTML",
		"Button",
		"Image",
	}
)

_DETAILS_ID = "__details"
_CONNECTIONS_ID = "connections_tab"


@frappe.whitelist()
def get(doctype: str) -> dict[str, Any]:
	"""Ordered tabs for a DocType: synthetic Details + each Tab Break."""
	require_login()
	assert_allowed_doctype(doctype)

	meta = frappe.get_meta(doctype)
	tabs: list[dict[str, Any]] = []
	current: dict[str, Any] = {
		"id": _DETAILS_ID,
		"label": _("Details"),
		"fieldname": _DETAILS_ID,
		"fields": [],
	}
	tabs.append(current)
	has_connections_break = False

	for df in meta.fields:
		if df.fieldtype == "Tab Break":
			fid = df.fieldname or frappe.scrub(df.label or "tab")
			label = df.label or fid
			if fid in ("connections_tab", "dashboard_tab") or str(label).lower() == "connections":
				has_connections_break = True
			current = {
				"id": fid,
				"label": _(label) if label else fid,
				"fieldname": fid,
				"fields": [],
			}
			tabs.append(current)
			continue
		if df.fieldtype in _SKIP_TYPES:
			continue
		if df.fieldtype in ("Table", "Table MultiSelect") and df.fieldname:
			current["fields"].append(df.fieldname)
			continue
		if df.fieldname:
			current["fields"].append(df.fieldname)

	dash = meta.get_dashboard_data() or {}
	has_dashboard = bool(dash.get("transactions"))
	if has_dashboard and not has_connections_break:
		tabs.append(
			{
				"id": _CONNECTIONS_ID,
				"label": _("Connections"),
				"fieldname": _CONNECTIONS_ID,
				"fields": [],
				"is_connections": True,
			}
		)
	else:
		for tab in tabs:
			if tab["id"] in (_CONNECTIONS_ID, "dashboard_tab") or tab["label"] == _("Connections"):
				tab["is_connections"] = True

	return {
		"doctype": doctype,
		"tabs": tabs,
		"has_connections": has_dashboard or has_connections_break,
	}
