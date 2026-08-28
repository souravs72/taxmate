# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	columns = [
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 160,
		},
		{
			"label": _("Invoice"),
			"fieldname": "reference_name",
			"fieldtype": "Dynamic Link",
			"options": "reference_doctype",
			"width": 160,
		},
		{"label": _("DocType"), "fieldname": "reference_doctype", "fieldtype": "Data", "width": 120},
		{"label": _("UUID"), "fieldname": "uuid", "fieldtype": "Data", "width": 280},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
		{
			"label": _("Document Type"),
			"fieldname": "document_type_code",
			"fieldtype": "Data",
			"width": 100,
		},
		{"label": _("Modified"), "fieldname": "modified", "fieldtype": "Datetime", "width": 160},
	]

	query_filters = {}
	if filters.get("company"):
		query_filters["company"] = filters["company"]
	if filters.get("status"):
		query_filters["status"] = filters["status"]

	data = frappe.get_all(
		"UAE E-Invoice Log",
		filters=query_filters,
		fields=[
			"company",
			"reference_doctype",
			"reference_name",
			"uuid",
			"status",
			"document_type_code",
			"modified",
		],
		order_by="modified desc",
		limit=500,
	)
	return columns, data
