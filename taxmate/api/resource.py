"""Allowlisted CRUD over ``frappe.client``."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.client import delete as client_delete
from frappe.client import get as client_get
from frappe.client import get_count as client_get_count
from frappe.client import get_list as client_get_list
from frappe.client import insert as client_insert
from frappe.client import save as client_save
from frappe.utils import cint, cstr

from taxmate.search import DENIED_SEARCH_DOCTYPES
from taxmate.utils.company import (
	can_use_company,
	company_scoped,
	get_default_company,
	owning_company_field,
	set_active_company,
)


def is_allowed_doctype(doctype: str) -> bool:
	if not doctype or doctype in DENIED_SEARCH_DOCTYPES:
		return False
	if not frappe.db.exists("DocType", doctype):
		return False
	# Child tables are not in Desk search; listing them skips parent row permissions.
	if frappe.get_meta(doctype).istable:
		return False
	from taxmate.api import catalog_doctypes

	return doctype in catalog_doctypes()


def assert_allowed_doctype(doctype: str) -> None:
	if not is_allowed_doctype(doctype):
		frappe.throw(
			_("DocType {0} is not part of the TaxMate accounts API").format(doctype),
			frappe.PermissionError,
		)


def assert_company_read(company: str | None) -> None:
	if not company:
		return
	if not can_use_company(company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def require_login() -> None:
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.AuthenticationError)


def _parse(value):
	if isinstance(value, str):
		return frappe.parse_json(value)
	return value


def _names_company(row) -> bool:
	"""Does one filter row (``[field, op, value]`` or ``[doctype, field, op, value]``) set company?"""
	if not isinstance(row, list | tuple) or not row:
		return False
	field = row[1] if len(row) >= 4 else row[0]
	return field == "company"


def _row_company_clause(row):
	"""``(operator, value)`` when a filter row constrains ``company``."""
	if not isinstance(row, list | tuple):
		return None
	if len(row) >= 4 and row[1] == "company":
		return row[2], row[3]
	if len(row) >= 3 and row[0] == "company":
		return row[1], row[2]
	return None


def _pinned_companies(parsed) -> list[str]:
	"""Company names a filter pins with ``=`` or ``in``."""
	names: list[str] = []
	if isinstance(parsed, dict) and "company" in parsed:
		value = parsed["company"]
		if isinstance(value, str):
			names.append(value)
		elif isinstance(value, list | tuple) and value:
			op = value[0]
			if op in ("=", "==") and len(value) > 1 and isinstance(value[1], str):
				names.append(value[1])
			elif op == "in" and len(value) > 1 and isinstance(value[1], list | tuple):
				names.extend(str(name) for name in value[1] if name)
	elif isinstance(parsed, list | tuple):
		for row in parsed:
			clause = _row_company_clause(row)
			if not clause:
				continue
			op, value = clause
			if op in ("=", "==") and isinstance(value, str):
				names.append(value)
			elif op == "in" and isinstance(value, list | tuple):
				names.extend(str(name) for name in value if name)
	return names


def assert_company_filters(filters=None, or_filters=None) -> None:
	"""Reject a company a caller names but cannot read.

	Link search and list screens pass their own company. That value has to be
	one ``can_use_company`` allows. Frappe still applies User Permissions on
	the query; this fails the request instead of returning another company's rows.
	"""
	for name in _pinned_companies(_parse(filters)) + _pinned_companies(_parse(or_filters)):
		if not can_use_company(name):
			frappe.throw(_("You do not have access to {0}").format(name), frappe.PermissionError)


def scope_to_active_company(doctype: str, filters=None, or_filters=None):
	"""Add ``company = <active company>`` to ``filters`` for single-company doctypes.

	The header company switcher picks ONE company; every list and count follows
	it without each screen having to remember a filter. A screen that passes its
	own company filter (in ``filters`` or ``or_filters``) keeps it, still
	permission-checked. Link search is NOT scoped here: forms whose company can
	differ from the active one (Item defaults, Bank Account, POS Profile) pass
	their own company filter to the picker.
	"""
	assert_company_filters(filters, or_filters)
	if not company_scoped(doctype):
		return filters
	parsed_or = _parse(or_filters)
	if _pinned_companies(parsed_or):
		return filters
	company = get_default_company()
	if not company:
		return filters
	parsed = _parse(filters)
	if not parsed:
		return [["company", "=", company]]
	if _pinned_companies(parsed):
		return parsed
	if isinstance(parsed, dict):
		return {**parsed, "company": company}
	if isinstance(parsed, list | tuple):
		return [*parsed, ["company", "=", company]]
	return filters


def _as_data(value):
	"""Unwrap a Document into a plain dict for the JSON response.

	``callable(getattr(...))``, not ``hasattr``: frappe._dict sets
	``__getattr__ = dict.get`` (frappe/types/frappedict.py:22), so hasattr is
	True for every key name and ``value.as_dict()`` would raise TypeError on a
	plain _dict.
	"""
	if callable(getattr(value, "as_dict", None)):
		return value.as_dict()
	return value


def _require_doc(doc):
	doc = _parse(doc)
	if not doc or not doc.get("doctype"):
		frappe.throw(_("doctype is required"))
	assert_allowed_doctype(doc["doctype"])
	return doc


def _permission_aware_count(doctype, filters=None, or_filters=None) -> int:
	rows = frappe.get_list(
		doctype,
		filters=filters,
		or_filters=or_filters,
		fields=[{"COUNT": "*", "as": "total"}],
		limit=1,
	)
	return cint(rows[0].total) if rows else 0


@frappe.whitelist()
def get_list(
	doctype,
	fields=None,
	filters=None,
	order_by=None,
	limit_start=None,
	limit_page_length=20,
	or_filters=None,
	parent=None,
	group_by=None,
):
	require_login()
	assert_allowed_doctype(doctype)
	return client_get_list(
		doctype,
		fields=fields,
		filters=scope_to_active_company(doctype, filters, or_filters),
		order_by=order_by,
		limit_start=limit_start,
		limit_page_length=limit_page_length,
		or_filters=or_filters,
		parent=parent,
		group_by=group_by,
	)


@frappe.whitelist()
def get_count(doctype, filters=None, or_filters=None):
	require_login()
	assert_allowed_doctype(doctype)
	filters = scope_to_active_company(doctype, filters, or_filters)
	or_filters = _parse(or_filters)
	if or_filters:
		return _permission_aware_count(doctype, filters=_parse(filters), or_filters=or_filters)
	return client_get_count(doctype, filters=filters)


@frappe.whitelist()
def group_by_count(doctype: str, current_filters=None, field: str = "status"):
	require_login()
	assert_allowed_doctype(doctype)
	from frappe.desk.listview import get_group_by_count as desk_group_by_count

	current_filters = scope_to_active_company(doctype, current_filters) or []
	if not isinstance(current_filters, str):
		current_filters = frappe.as_json(current_filters)
	return desk_group_by_count(doctype, current_filters, field)


def _adopt_active_company_for_doc(doctype: str, name: str | None) -> str | None:
	"""Switch the header company when a deep-linked document belongs elsewhere.

	Lists stay scoped to the active company. Opening one document the user may
	read (User Permission) moves the switcher to that document's company so
	controller ``has_permission`` and the SPA header agree.
	"""
	if not name:
		return None
	field = owning_company_field(doctype)
	if not field:
		return None
	company = frappe.db.get_value(doctype, name, field[0])
	if not company:
		return None
	active = get_default_company()
	if str(company) == str(active or ""):
		return None
	if not can_use_company(company):
		return None
	set_active_company(company)
	# resource.get is a GET: Frappe rolls back GET requests unless asked to commit
	# (frappe/app.py after_request), which would undo the switch and make the SPA
	# reload forever. Persist it explicitly.
	frappe.local.flags.commit = True
	return company


@frappe.whitelist()
def get(doctype, name=None, filters=None, parent=None):
	require_login()
	assert_allowed_doctype(doctype)
	_adopt_active_company_for_doc(doctype, name)
	return client_get(doctype, name=name, filters=filters, parent=parent)


@frappe.whitelist(methods=["POST", "PUT"])
def insert(doc=None):
	require_login()
	return client_insert(_require_doc(doc))


@frappe.whitelist(methods=["POST", "PUT"])
def save(doc):
	require_login()
	return client_save(_require_doc(doc))


# Desk list bulk delete runs sync for ≤10 names; TaxMate SPA stays sync with a
# hard cap so a mis-click cannot queue hundreds of deletes in one request.
_BULK_DELETE_LIMIT = 50


def _assert_deletable(doctype: str, name: str) -> None:
	"""Submittable vouchers may only be deleted while draft (docstatus 0).

	Mirrors ERPNext / Frappe Desk: submitted docs must be cancelled first.
	"""
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("Document {0} {1} not found").format(doctype, name), frappe.DoesNotExistError)
	if not frappe.has_permission(doctype, "delete", doc=name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	meta = frappe.get_meta(doctype)
	if not meta.is_submittable:
		return
	docstatus = cint(frappe.db.get_value(doctype, name, "docstatus"))
	if docstatus != 0:
		frappe.throw(
			_("Only draft {0} can be deleted. Cancel submitted documents instead.").format(doctype),
			frappe.ValidationError,
		)


def _delete_one(doctype: str, name: str) -> None:
	assert_allowed_doctype(doctype)
	if not name:
		frappe.throw(_("name is required"))
	_assert_deletable(doctype, name)
	client_delete(doctype, name)


@frappe.whitelist(methods=["DELETE", "POST"])
def delete(doctype, name):
	require_login()
	_delete_one(doctype, name)
	return {"ok": True, "name": name}


@frappe.whitelist(methods=["POST"])
def bulk_delete(doctype: str, names=None):
	"""Delete many draft documents.

	Each name is committed independently (same idea as ``frappe.desk.reportview.delete_bulk``):
	one failure rolls back that row only and is reported in ``failed``.
	"""
	require_login()
	assert_allowed_doctype(doctype)
	names = _parse(names) or []
	if isinstance(names, str):
		names = [names]
	if not isinstance(names, (list, tuple)):
		frappe.throw(_("names must be a list"))

	clean = [str(raw or "").strip() for raw in names if str(raw or "").strip()]
	# Preserve order, drop duplicates.
	seen: set[str] = set()
	unique: list[str] = []
	for name in clean:
		if name in seen:
			continue
		seen.add(name)
		unique.append(name)

	if not unique:
		return {"deleted": [], "failed": []}

	if len(unique) > _BULK_DELETE_LIMIT:
		frappe.throw(
			_("Select at most {0} documents to delete at once").format(_BULK_DELETE_LIMIT),
			frappe.ValidationError,
		)

	deleted: list[str] = []
	failed: list[dict[str, str]] = []
	for name in unique:
		try:
			_delete_one(doctype, name)
			frappe.db.commit()
			deleted.append(name)
		except Exception as exc:
			message = _caught_message(exc)
			frappe.db.rollback()
			failed.append({"name": name, "error": message})
			frappe.clear_messages()
			frappe.local.message_log = []

	return {"deleted": deleted, "failed": failed}


def _caught_message(exc: BaseException) -> str:
	"""User-facing text from a caught throw, without a traceback."""
	import re

	from frappe.utils import strip_html

	def _plain(text: str) -> str:
		return re.sub(r"\s+", " ", strip_html(text)).strip()

	parts: list[str] = []
	for entry in list(getattr(frappe.local, "message_log", None) or []):
		try:
			row = frappe.parse_json(entry) if isinstance(entry, str) else entry
			text = row.get("message") if isinstance(row, dict) else str(entry)
		except Exception:
			text = str(entry)
		if text:
			plain = _plain(str(text))
			if plain:
				parts.append(plain)
	if parts:
		return " ".join(parts)
	return _plain(str(exc)) or type(exc).__name__


@frappe.whitelist()
def get_meta(doctype: str) -> dict[str, Any]:
	require_login()
	assert_allowed_doctype(doctype)
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	meta = frappe.get_meta(doctype)
	return {
		"name": meta.name,
		"module": meta.module,
		"issingle": int(meta.issingle or 0),
		"is_submittable": int(meta.is_submittable or 0),
		"is_tree": int(meta.is_tree or 0),
		"autoname": meta.autoname,
		"title_field": meta.title_field,
		"search_fields": meta.search_fields,
		"fields": [_field_meta(field, nest_children=True) for field in meta.fields],
	}


def _field_meta(field, nest_children: bool = False) -> dict[str, Any]:
	row = {
		"fieldname": field.fieldname,
		"label": field.label,
		"fieldtype": field.fieldtype,
		"options": field.options,
		"reqd": field.reqd,
		"hidden": field.hidden,
		"read_only": field.read_only,
		"default": field.default,
		"in_list_view": field.in_list_view,
		"in_standard_filter": field.in_standard_filter,
		"permlevel": field.permlevel,
		"depends_on": field.depends_on,
		"fetch_from": field.fetch_from,
	}
	if nest_children and field.fieldtype == "Table" and field.options:
		child = frappe.get_meta(field.options)
		if child.istable:
			row["fields"] = [_field_meta(f) for f in child.fields]
	return row


@frappe.whitelist()
def search_link(
	doctype: str,
	txt: str = "",
	filters=None,
	page_length: int = 10,
	searchfield: str | None = None,
	reference_doctype: str | None = None,
):
	require_login()
	assert_allowed_doctype(doctype)
	assert_company_filters(filters)
	from frappe.desk.search import search_link as desk_search_link

	return desk_search_link(
		doctype,
		txt or "",
		filters=filters,
		page_length=page_length,
		searchfield=searchfield,
		reference_doctype=reference_doctype,
	)


_VERSION_VALUE_MAX = 240
_VERSION_LIMIT_MAX = 100


def _version_display(value: Any) -> str:
	"""Short, printable value for a Version diff cell."""
	if value is None:
		return ""
	if isinstance(value, dict):
		# Child-row snapshot — prefer a human key, else name.
		for key in ("item_code", "account", "party", "user", "title", "item_name", "name"):
			if value.get(key):
				return _version_display(value.get(key))
		return _("(row)")
	text = cstr(value).strip()
	if len(text) > _VERSION_VALUE_MAX:
		return text[: _VERSION_VALUE_MAX - 1] + "…"
	return text


def _field_labels(doctype: str) -> dict[str, str]:
	meta = frappe.get_meta(doctype)
	labels: dict[str, str] = {}
	for field in meta.fields:
		if field.fieldname:
			labels[field.fieldname] = field.label or field.fieldname
	# Standard audit fields that may appear in diffs.
	for fieldname, label in (
		("docstatus", _("Status")),
		("owner", _("Owner")),
		("modified_by", _("Last updated by")),
	):
		labels.setdefault(fieldname, label)
	return labels


def _shape_version(row: dict[str, Any], labels: dict[str, str]) -> dict[str, Any]:
	raw = row.get("data")
	try:
		data = frappe.parse_json(raw) if raw else {}
	except Exception:
		data = {}
	if not isinstance(data, dict):
		data = {}

	changed = []
	for item in data.get("changed") or []:
		if not isinstance(item, (list, tuple)) or len(item) < 3:
			continue
		field = cstr(item[0])
		changed.append(
			{
				"field": field,
				"label": labels.get(field) or field,
				"old": _version_display(item[1]),
				"new": _version_display(item[2]),
			}
		)

	added = []
	for item in data.get("added") or []:
		if not isinstance(item, (list, tuple)) or len(item) < 2:
			continue
		table = cstr(item[0])
		added.append(
			{
				"table": table,
				"label": labels.get(table) or table,
				"summary": _version_display(item[1]),
			}
		)

	removed = []
	for item in data.get("removed") or []:
		if not isinstance(item, (list, tuple)) or len(item) < 2:
			continue
		table = cstr(item[0])
		removed.append(
			{
				"table": table,
				"label": labels.get(table) or table,
				"summary": _version_display(item[1]),
			}
		)

	row_changed = []
	for item in data.get("row_changed") or []:
		if not isinstance(item, (list, tuple)) or len(item) < 4:
			continue
		table = cstr(item[0])
		fields = []
		for cell in item[3] or []:
			if not isinstance(cell, (list, tuple)) or len(cell) < 3:
				continue
			field = cstr(cell[0])
			fields.append(
				{
					"field": field,
					"label": labels.get(field) or field,
					"old": _version_display(cell[1]),
					"new": _version_display(cell[2]),
				}
			)
		row_changed.append(
			{
				"table": table,
				"label": labels.get(table) or table,
				"row": cint(item[1]),
				"row_name": cstr(item[2]),
				"fields": fields,
			}
		)

	return {
		"name": row.get("name"),
		"owner": row.get("owner"),
		"creation": row.get("creation"),
		"changed": changed,
		"added": added,
		"removed": removed,
		"row_changed": row_changed,
	}


@frappe.whitelist()
def get_versions(doctype: str, name: str, limit: int = 50) -> dict[str, Any]:
	"""Field-level change history for one document.

	Uses the Version table (track_changes). Callers must have read
	permission on the source document. Version itself is not catalogued
	for direct SPA list access.
	"""
	require_login()
	assert_allowed_doctype(doctype)
	if not name:
		frappe.throw(_("name is required"))
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("Document {0} {1} not found").format(doctype, name), frappe.DoesNotExistError)
	if not frappe.has_permission(doctype, "read", doc=name):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


	meta = frappe.get_meta(doctype)
	limit = min(max(cint(limit), 1), _VERSION_LIMIT_MAX)
	owner, creation = frappe.db.get_value(doctype, name, ["owner", "creation"]) or (None, None)

	versions: list[dict[str, Any]] = []
	if meta.track_changes:
		rows = frappe.get_all(
			"Version",
			filters={"ref_doctype": doctype, "docname": cstr(name)},
			fields=["name", "owner", "creation", "data"],
			limit_page_length=limit,
			order_by="creation desc",
		)
		labels = _field_labels(doctype)
		versions = [_shape_version(row, labels) for row in rows]

	owners = {owner} | {row.get("owner") for row in versions if row.get("owner")}
	owners.discard(None)
	owners.discard("")
	full_names: dict[str, str] = {}
	if owners:
		for row in frappe.get_all(
			"User",
			filters={"name": ("in", list(owners))},
			fields=["name", "full_name"],
		):
			full_names[row.name] = row.full_name or row.name

	for row in versions:
		user = row.get("owner")
		row["owner_name"] = full_names.get(user) or user

	return {
		"track_changes": bool(meta.track_changes),
		"created_by": owner,
		"created_by_name": full_names.get(owner) or owner,
		"created_on": creation,
		"versions": versions,
	}
