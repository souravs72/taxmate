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
	values = {"today": frappe.utils.nowdate()}
	clauses = ["1=1"]
	if filters.get("company"):
		clauses.append("company = %(company)s")
		values["company"] = filters["company"]
	if filters.get("status"):
		clauses.append("status = %(status)s")
		values["status"] = filters["status"]
	if frappe.db.has_column("UAE E-Invoice Log", "sla_due"):
		sla = filters.get("sla")
		if sla == "Breached":
			clauses.append("ifnull(accepted_on, '') = '' and sla_due < %(today)s")
		elif sla == "Open":
			clauses.append("ifnull(accepted_on, '') = '' and sla_due >= %(today)s")
		elif sla == "Met":
			clauses.append("ifnull(accepted_on, '') != '' and date(accepted_on) <= sla_due")
		elif sla == "Late":
			clauses.append("ifnull(accepted_on, '') != '' and date(accepted_on) > sla_due")

	data = frappe.db.sql(
		f"""
		select company, reference_doctype, reference_name, uuid, status,
			document_type_code, issued_on, accepted_on, sla_due, modified
		from `tabUAE E-Invoice Log`
		where {' and '.join(clauses)}
		order by modified desc
		limit 500
		""",
		values,
		as_dict=True,
	)
	for row in data:
		row["sla"] = sla_status(row.get("issued_on"), row.get("accepted_on"), sla_days=days)
	return columns, data
