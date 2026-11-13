"""DocType tab layout for the SPA — mirrors Desk Tab Breaks and sections.

Callers:
- taxmate/api/__init__.py get_catalog action form_layout (~line 378)
- frontend METHOD.formLayout → DocTabs / DocTabShell / DeskTabPanel
- taxmate/tests/test_form_layout.py

Grep: taxmate/api/form_layout.py already exists; this rewrite replaces the
fieldname-only payload with sections/columns/field meta. No other module
returns Desk Tab Break structure for the SPA.

Reads DocType meta only (no data files). Return shape:
  {doctype, tabs:[{id,label,fieldname,fields,sections:[{id,label,columns:[[
    {fieldname,label,fieldtype,options,reqd,read_only,depends_on,default,columns?}]]}], is_connections?}]}

User: "I wanted you to mimic erpnext like tabs and fields for all the
doctypes present in the sidebar. I still don't see the same structure"
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_allowed_doctype, require_login
from taxmate.setup.company_fields import STRICT_CUSTOM_COMPANY

_LAYOUT_ONLY = frozenset(
	{
		"Tab Break",
		"Section Break",
		"Column Break",
		"Fold",
		"Heading",
		"HTML",
		"Button",
		"Image",
	}
)

_CHILD_SKIP = _LAYOUT_ONLY | {"Table", "Table MultiSelect"}

_DETAILS_ID = "__details"
_CONNECTIONS_ID = "connections_tab"

# ERPNext v16 dropped reqd on Customer Group / Territory / Supplier Group.
# TaxMate still requires them to save, and isolation requires custom_company
# on STRICT masters. Overlay so DeskControl can paint the same * Desk would.
_REQD_OVERLAY: dict[str, frozenset[str]] = {
	"Customer": frozenset({"customer_group", "territory", "custom_company"}),
	"Supplier": frozenset({"supplier_group", "custom_company"}),
}


def _effective_reqd(doctype: str | None, df) -> int:
	if df.reqd:
		return 1
	if not doctype:
		return 0
	if df.fieldname == "custom_company" and doctype in STRICT_CUSTOM_COMPANY:
		return 1
	return 1 if df.fieldname in _REQD_OVERLAY.get(doctype, frozenset()) else 0


def _link_filters(df) -> Any:
	raw = getattr(df, "link_filters", None)
	if not raw:
		return None
	if isinstance(raw, (list, dict)):
		return raw
	try:
		parsed = frappe.parse_json(raw)
	except (TypeError, ValueError):
		return None
	return parsed or None


def _field_dict(df, nest_table: bool = True, doctype: str | None = None) -> dict[str, Any]:
	row: dict[str, Any] = {
		"fieldname": df.fieldname,
		"label": _(df.label) if df.label else df.fieldname,
		"fieldtype": df.fieldtype,
		"options": df.options or None,
		"reqd": _effective_reqd(doctype, df),
		"read_only": 1 if df.read_only else 0,
		"depends_on": df.depends_on or None,
		"mandatory_depends_on": df.mandatory_depends_on or None,
		"default": df.default if df.default not in (None, "") else None,
	}
	filters = _link_filters(df)
	if filters:
		row["link_filters"] = filters
	if getattr(df, "is_virtual", 0):
		row["is_virtual"] = 1
	if nest_table and df.fieldtype in ("Table", "Table MultiSelect") and df.options:
		row["columns"] = _table_columns(df.options)
	return row


def _table_columns(child_dt: str) -> list[dict[str, Any]]:
	if not frappe.db.exists("DocType", child_dt):
		return []
	child = frappe.get_meta(child_dt)
	if not child.istable:
		return []
	listed: list[dict[str, Any]] = []
	fallback: list[dict[str, Any]] = []
	for field in child.fields:
		if not field.fieldname or getattr(field, "hidden", 0):
			continue
		if field.fieldtype in _CHILD_SKIP:
			continue
		row = _field_dict(field, nest_table=False, doctype=child_dt)
		if field.in_list_view:
			listed.append(row)
		elif len(fallback) < 8:
			fallback.append(row)
	return listed or fallback


def _new_section(df=None) -> dict[str, Any]:
	label = ""
	fid = ""
	if df is not None:
		fid = df.fieldname or ""
		label = _(df.label) if df.label else ""
	return {"id": fid or frappe.generate_hash(length=8), "label": label, "columns": [[]]}


def _new_tab(fid: str, label: str) -> dict[str, Any]:
	return {
		"id": fid,
		"label": _(label) if label else fid,
		"fieldname": fid,
		"sections": [_new_section()],
		"fields": [],
	}


@frappe.whitelist()
def get(doctype: str) -> dict[str, Any]:
	"""Ordered Desk tabs with sections, columns, and field meta."""
	require_login()
	assert_allowed_doctype(doctype)
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	meta = frappe.get_meta(doctype)
	tabs: list[dict[str, Any]] = []
	current = _new_tab(_DETAILS_ID, "Details")
	tabs.append(current)
	section = current["sections"][0]
	col_idx = 0
	has_connections_break = False
	started_fields = False

	for df in meta.fields:
		if df.fieldtype == "Tab Break":
			fid = df.fieldname or frappe.scrub(df.label or "tab")
			label = df.label or fid
			if fid in (_CONNECTIONS_ID, "dashboard_tab") or str(label).lower() == "connections":
				has_connections_break = True
			current = _new_tab(fid, label)
			tabs.append(current)
			section = current["sections"][0]
			col_idx = 0
			started_fields = False
			continue

		if df.fieldtype == "Section Break":
			if not started_fields and len(current["sections"]) == 1 and not section["columns"][0]:
				current["sections"] = []
			section = _new_section(df)
			current["sections"].append(section)
			col_idx = 0
			continue

		if df.fieldtype == "Column Break":
			section["columns"].append([])
			col_idx = len(section["columns"]) - 1
			continue

		if df.fieldtype in _LAYOUT_ONLY:
			continue
		if getattr(df, "hidden", 0):
			continue
		if not df.fieldname:
			continue

		started_fields = True
		while col_idx >= len(section["columns"]):
			section["columns"].append([])
		fd = _field_dict(df, doctype=doctype)
		section["columns"][col_idx].append(fd)
		current["fields"].append(df.fieldname)

	for tab in tabs:
		cleaned = []
		for sec in tab["sections"]:
			cols = [c for c in sec["columns"] if c]
			if not cols:
				continue
			sec["columns"] = cols
			cleaned.append(sec)
		tab["sections"] = cleaned or [_new_section()]

	dash = meta.get_dashboard_data() or {}
	has_dashboard = bool(dash.get("transactions"))
	if has_dashboard and not has_connections_break:
		tabs.append(
			{
				"id": _CONNECTIONS_ID,
				"label": _("Connections"),
				"fieldname": _CONNECTIONS_ID,
				"sections": [],
				"fields": [],
				"is_connections": True,
			}
		)
	else:
		for tab in tabs:
			if tab["id"] in (_CONNECTIONS_ID, "dashboard_tab") or tab["label"] == _("Connections"):
				tab["is_connections"] = True
				tab["sections"] = []

	return {
		"doctype": doctype,
		"tabs": tabs,
		"has_connections": has_dashboard or has_connections_break,
	}
