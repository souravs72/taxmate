"""Desk-parity Connections for the SPA (open counts + SPA routes only).

Callers:
- taxmate.api.get_catalog → action connections_open_count
- frontend METHOD.connectionsOpenCount → ConnectionsPanel
- taxmate.tests.test_connections

Uses frappe.desk.notifications.get_open_count (same source as Desk).
Grep: no taxmate.api.connections yet; sales_order.linked_documents is SO-only.

Return shape:
  {"groups": [{"label": "Fulfillment", "items": [
     {"doctype": "Delivery Note", "count": 2, "open_count": 1,
      "spa_path": "/delivery-notes", "fieldname": "sales_order"}]}]}
No dates; read-only.

User: "Implement the plan as specified, it is attached for your reference.
Do NOT edit the plan file itself. ... Don't stop until you have completed
all the to-dos."
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.desk.notifications import get_open_count

from taxmate.api.resource import assert_allowed_doctype, require_login
from taxmate.api.spa_routes import spa_list_path


@frappe.whitelist()
def open_count(doctype: str, name: str) -> dict[str, Any]:
	"""Grouped connection counts for a document, with SPA list paths."""
	require_login()
	assert_allowed_doctype(doctype)
	if not name or not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found").format(_(doctype), name), frappe.DoesNotExistError)
	if not frappe.has_permission(doctype, "read", doc=name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	meta = frappe.get_meta(doctype)
	dash = meta.get_dashboard_data() or {}
	transactions = list(dash.get("transactions") or [])
	if not transactions:
		return {"groups": [], "fieldname": dash.get("fieldname")}

	raw = get_open_count(doctype, name) or {}
	count_blob = raw.get("count") or {}
	found: list[dict[str, Any]] = []
	if isinstance(count_blob, dict):
		found.extend(count_blob.get("external_links_found") or [])
		found.extend(count_blob.get("internal_links_found") or [])
	elif isinstance(count_blob, list):
		found = count_blob

	by_dt = {row.get("doctype"): row for row in found if row.get("doctype")}

	fieldname = dash.get("fieldname")
	non_standard = dash.get("non_standard_fieldnames") or {}

	groups: list[dict[str, Any]] = []
	for group in transactions:
		label = group.get("label") or ""
		items_out = []
		for linked in group.get("items") or []:
			row = by_dt.get(linked) or {}
			items_out.append(
				{
					"doctype": linked,
					"count": int(row.get("count") or 0),
					"open_count": int(row.get("open_count") or 0),
					"spa_path": spa_list_path(linked),
					"fieldname": non_standard.get(linked) or fieldname,
				}
			)
		groups.append({"label": _(label) if label else "", "items": items_out})

	return {"groups": groups, "fieldname": fieldname}
