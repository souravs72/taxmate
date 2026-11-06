"""Desk-like list view column/filter/sort resolution for the SPA.

Mirrors frappe.views.ListView / BaseList rules for in_list_view columns and
in_standard_filter fields so TaxMate lists match Desk defaults without
hardcoding per DocType.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.model import no_value_fields
from frappe.utils import cint

from taxmate.api.resource import _field_meta, assert_allowed_doctype, require_login


def _is_list_view_field(df, readable_levels: set[int]) -> bool:
	if getattr(df, "is_virtual", None):
		return False
	if cint(df.permlevel or 0) not in readable_levels:
		return False
	if df.fieldname == "status":
		return True
	if df.fieldtype in no_value_fields:
		return False
	# Currency with party-specific options still shows on Desk lists when in_list_view.
	if df.fieldtype == "Currency" and df.options and ":" in str(df.options):
		return bool(df.in_list_view)
	return bool(df.in_list_view)


def _column_from_df(df) -> dict[str, Any]:
	return {
		"fieldname": df.fieldname,
		"label": _(df.label) if df.label else df.fieldname,
		"fieldtype": df.fieldtype,
		"options": df.options,
		"width": getattr(df, "width", None) or None,
	}


@frappe.whitelist()
def list_view_spec(doctype: str) -> dict[str, Any]:
	"""Resolved list columns, fetch fields, standard filters, and default sort."""
	require_login()
	assert_allowed_doctype(doctype)
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	meta = frappe.get_meta(doctype)
	title_field = meta.title_field or None
	sort_field = meta.sort_field or "modified"
	sort_order = (meta.sort_order or "DESC").lower()
	if sort_order not in ("asc", "desc"):
		sort_order = "desc"
	# Desk ListView only surfaces columns the user can read at that permlevel.
	readable_levels = set(meta.get_permlevel_access("read"))

	# Columns: title (or name) first, then in_list_view fields in DocType order.
	seen: set[str] = set()
	columns: list[dict[str, Any]] = []

	def add_column(df_or_name, *, force_label: str | None = None):
		if isinstance(df_or_name, str):
			fieldname = df_or_name
			if fieldname in seen:
				return
			df = meta.get_field(fieldname)
			if df and cint(df.permlevel or 0) not in readable_levels:
				return
			if df:
				col = _column_from_df(df)
			else:
				# name / modified etc. are std fields without a DocField row sometimes.
				col = {
					"fieldname": fieldname,
					"label": force_label or _(fieldname.replace("_", " ").title()),
					"fieldtype": "Data",
					"options": None,
					"width": None,
				}
			if force_label:
				col["label"] = force_label
			seen.add(fieldname)
			columns.append(col)
			return
		df = df_or_name
		if df.fieldname in seen:
			return
		if cint(df.permlevel or 0) not in readable_levels:
			return
		seen.add(df.fieldname)
		columns.append(_column_from_df(df))

	# Desk shows the title/ID column first.
	if title_field and meta.has_field(title_field):
		add_column(title_field)
	add_column("name", force_label=_("ID") if title_field else _("Name"))

	for df in meta.fields:
		if _is_list_view_field(df, readable_levels):
			add_column(df)

	# Standard filters: DocType fields flagged in_standard_filter.
	standard_filters: list[dict[str, Any]] = []
	for df in meta.fields:
		if not df.in_standard_filter or getattr(df, "is_virtual", None):
			continue
		if df.fieldtype in no_value_fields:
			continue
		if cint(df.permlevel or 0) not in readable_levels:
			continue
		standard_filters.append(_field_meta(df))

	search_fields = []
	if meta.search_fields:
		search_fields = [f.strip() for f in meta.search_fields.split(",") if f.strip()]

	# Fields to fetch for the current column set + always-needed keys.
	fetch: set[str] = {"name"}
	if meta.is_submittable:
		fetch.add("docstatus")
	if title_field:
		fetch.add(title_field)
	fetch.add(sort_field)
	for col in columns:
		fetch.add(col["fieldname"])
	for sf in standard_filters:
		fetch.add(sf["fieldname"])
	for f in search_fields:
		if meta.has_field(f) or f == "name":
			fetch.add(f)
	# status helps draft-delete mode even when not a column
	if meta.has_field("status"):
		fetch.add("status")

	return {
		"doctype": doctype,
		"title_field": title_field,
		"search_fields": search_fields,
		"sort_field": sort_field,
		"sort_order": sort_order,
		"image_field": getattr(meta, "image_field", None) or None,
		"is_submittable": int(meta.is_submittable or 0),
		"columns": columns,
		"standard_filters": standard_filters,
		"fields": sorted(fetch),
	}
