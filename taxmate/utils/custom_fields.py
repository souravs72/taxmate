"""Custom field helpers (india_compliance-style)."""

from __future__ import annotations

import functools

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def make_custom_fields(custom_fields, module_name, *args, **kwargs):
	"""Stamp module on each field definition, then create/update Custom Fields."""
	for _doctypes, fields in custom_fields.items():
		if isinstance(fields, dict):
			fields = (fields,)
		for field in fields:
			field["module"] = module_name

	return create_custom_fields(custom_fields, *args, **kwargs)


def get_custom_fields_creator(module_name):
	return functools.partial(make_custom_fields, module_name=module_name)


def toggle_custom_fields(custom_fields, show: bool):
	for doctypes, fields in custom_fields.items():
		if isinstance(fields, dict):
			fields = [fields]
		if isinstance(doctypes, str):
			doctypes = (doctypes,)
		for doctype in doctypes:
			frappe.db.set_value(
				"Custom Field",
				{
					"dt": doctype,
					"fieldname": ["in", [field["fieldname"] for field in fields]],
				},
				"hidden",
				int(not show),
			)
			frappe.clear_cache(doctype=doctype)


def delete_custom_fields(custom_fields):
	for doctypes, fields in custom_fields.items():
		if isinstance(fields, dict):
			fields = [fields]
		if isinstance(doctypes, str):
			doctypes = (doctypes,)
		for doctype in doctypes:
			frappe.db.delete(
				"Custom Field",
				{
					"fieldname": ("in", [field["fieldname"] for field in fields]),
					"dt": doctype,
				},
			)
			frappe.clear_cache(doctype=doctype)
