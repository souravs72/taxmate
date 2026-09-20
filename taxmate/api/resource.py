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

from taxmate.search import (
	ALLOWED_SEARCH_DOCTYPES,
	ALLOWED_SEARCH_MODULES,
	DENIED_SEARCH_DOCTYPES,
	GLOBAL_SEARCH_DOCTYPES,
)


def is_allowed_doctype(doctype: str) -> bool:
	if not doctype or doctype in DENIED_SEARCH_DOCTYPES:
		return False
	if not frappe.db.exists("DocType", doctype):
		return False
	# Child tables are not in Desk search; listing them skips parent row permissions.
	if frappe.get_meta(doctype).istable:
		return False
	if doctype in ALLOWED_SEARCH_DOCTYPES or doctype in GLOBAL_SEARCH_DOCTYPES:
		return True
	module = frappe.db.get_value("DocType", doctype, "module")
	return module in ALLOWED_SEARCH_MODULES


def assert_allowed_doctype(doctype: str) -> None:
	if not is_allowed_doctype(doctype):
		frappe.throw(
			_("DocType {0} is not part of the TaxMate accounts API").format(doctype),
			frappe.PermissionError,
		)


def assert_company_read(company: str | None) -> None:
	if not company:
		return
	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def require_login() -> None:
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.AuthenticationError)


def _parse(value):
	if isinstance(value, str):
		return frappe.parse_json(value)
	return value


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
):
	assert_allowed_doctype(doctype)
	return client_get_list(
		doctype,
		fields=fields,
		filters=filters,
		order_by=order_by,
		limit_start=limit_start,
		limit_page_length=limit_page_length,
		or_filters=or_filters,
		parent=parent,
	)


@frappe.whitelist()
def get_count(doctype, filters=None):
	assert_allowed_doctype(doctype)
	return client_get_count(doctype, filters=filters)


@frappe.whitelist()
def get(doctype, name=None, filters=None, parent=None):
	assert_allowed_doctype(doctype)
	return client_get(doctype, name=name, filters=filters, parent=parent)


@frappe.whitelist(methods=["POST", "PUT"])
def insert(doc=None):
	return client_insert(_require_doc(doc))


@frappe.whitelist(methods=["POST", "PUT"])
def save(doc):
	return client_save(_require_doc(doc))


@frappe.whitelist(methods=["DELETE", "POST"])
def delete(doctype, name):
	assert_allowed_doctype(doctype)
	return client_delete(doctype, name)


@frappe.whitelist()
def get_meta(doctype: str) -> dict[str, Any]:
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
	assert_allowed_doctype(doctype)
	from frappe.desk.search import search_link as desk_search_link

	return desk_search_link(
		doctype,
		txt or "",
		filters=filters,
		page_length=page_length,
		searchfield=searchfield,
		reference_doctype=reference_doctype,
	)
