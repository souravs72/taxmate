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

	conditions = []
	values = {}
	if filters.get("company"):
		conditions.append("company = %(company)s")
		values["company"] = filters["company"]
	if filters.get("status"):
		conditions.append("status = %(status)s")
		values["status"] = filters["status"]

	where = (" where " + " and ".join(conditions)) if conditions else ""
	data = frappe.db.sql(
		f"""
		select company, reference_doctype, reference_name, uuid, status,
			document_type_code, modified
		from `tabUAE E-Invoice Log`
		{where}
		order by modified desc
		limit 500
		""",
		values,
		as_dict=True,
	)
	return columns, data
