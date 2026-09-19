# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""Open late-filing notices. Status only — not a penalty calculator."""

from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"label": _("Notice"), "fieldname": "name", "fieldtype": "Link", "options": "UAE Late Filing Notice", "width": 200},
		{"label": _("Company"), "fieldname": "company", "fieldtype": "Link", "options": "Company", "width": 180},
		{"label": _("Obligation"), "fieldname": "obligation", "fieldtype": "Data", "width": 140},
		{"label": _("Due Date"), "fieldname": "due_date", "fieldtype": "Date", "width": 110},
		{"label": _("Days Late"), "fieldname": "days_late", "fieldtype": "Int", "width": 100},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{"label": _("Source"), "fieldname": "source_name", "fieldtype": "Dynamic Link", "options": "source_doctype", "width": 200},
		{"label": _("Source Type"), "fieldname": "source_doctype", "fieldtype": "Link", "options": "DocType", "width": 180},
	]


def get_data(filters):
	if not frappe.db.exists("DocType", "UAE Late Filing Notice"):
		return []
	conditions = {}
	if filters.get("company"):
		conditions["company"] = filters["company"]
	if filters.get("status"):
		conditions["status"] = filters["status"]
	return frappe.get_all(
		"UAE Late Filing Notice",
		filters=conditions,
		fields=["name", "company", "obligation", "due_date", "days_late", "status", "source_name", "source_doctype"],
		order_by="days_late desc, due_date asc",
	)
