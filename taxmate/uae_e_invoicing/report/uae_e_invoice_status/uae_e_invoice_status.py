# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _


def execute(filters=None):
	if not frappe.has_permission("UAE E-Invoice Log", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

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
		{"label": _("Issued On"), "fieldname": "issued_on", "fieldtype": "Datetime", "width": 160},
		{"label": _("SLA Due"), "fieldname": "sla_due", "fieldtype": "Date", "width": 110},
		{"label": _("SLA"), "fieldname": "sla", "fieldtype": "Data", "width": 90},
		{"label": _("Modified"), "fieldname": "modified", "fieldtype": "Datetime", "width": 160},
	]

	if filters.get("company") and not frappe.has_permission("Company", "read", filters["company"]):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from taxmate.uae_e_invoicing.utils.mandate import get_sla_days, sla_status

	days = get_sla_days()
	list_filters = {}
	if filters.get("company"):
		list_filters["company"] = filters["company"]
	if filters.get("status"):
		list_filters["status"] = filters["status"]

	fields = [
		"company",
		"reference_doctype",
		"reference_name",
		"uuid",
		"status",
		"document_type_code",
		"issued_on",
		"accepted_on",
		"modified",
	]
	if frappe.db.has_column("UAE E-Invoice Log", "sla_due"):
		fields.append("sla_due")

	data = frappe.get_list(
		"UAE E-Invoice Log",
		filters=list_filters,
		fields=fields,
		order_by="modified desc",
		limit_page_length=500,
	)
	out = []
	for row in data:
		row["sla"] = sla_status(row.get("issued_on"), row.get("accepted_on"), sla_days=days)
		if filters.get("sla") and row["sla"] != filters.get("sla"):
			continue
		out.append(row)
	return columns, out
