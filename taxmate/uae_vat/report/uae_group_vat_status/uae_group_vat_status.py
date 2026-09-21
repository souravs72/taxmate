# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""One row per UAE company: VAT group role, establishments, last VAT 201."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.utils.vat_group import active_group_for_company


def execute(filters=None):
	return get_columns(), get_data()


def get_columns():
	return [
		{
			"label": _("Company"),
			"fieldname": "company",
			"fieldtype": "Link",
			"options": "Company",
			"width": 220,
		},
		{"label": _("Role"), "fieldname": "group_role", "fieldtype": "Data", "width": 140},
		{
			"label": _("VAT Group"),
			"fieldname": "vat_group",
			"fieldtype": "Link",
			"options": "UAE VAT Group",
			"width": 180,
		},
		{"label": _("Group TIN"), "fieldname": "group_trn", "fieldtype": "Data", "width": 130},
		{"label": _("Establishments"), "fieldname": "establishments", "fieldtype": "Int", "width": 120},
		{
			"label": _("Head Office"),
			"fieldname": "head_office",
			"fieldtype": "Link",
			"options": "UAE Establishment",
			"width": 180,
		},
		{
			"label": _("Last VAT 201"),
			"fieldname": "last_vat_201",
			"fieldtype": "Link",
			"options": "UAE VAT 201 Filing Log",
			"width": 200,
		},
	]


def get_data():
	from frappe.utils import today

	rows = []
	for company in frappe.get_list("Company", filters={"country": UAE_COUNTRY}, pluck="name"):
		group = (
			active_group_for_company(company, today())
			if frappe.db.exists("DocType", "UAE VAT Group")
			else None
		)
		if group:
			role = _("Representative") if group["is_representative"] else _("Member")
		else:
			role = _("Standalone")
		est_count = 0
		head = ""
		if frappe.db.exists("DocType", "UAE Establishment"):
			est_count = frappe.db.count("UAE Establishment", {"company": company})
			head = (
				frappe.db.get_value("UAE Establishment", {"company": company, "is_head_office": 1}, "name")
				or ""
			)
		last = frappe.db.get_value(
			"UAE VAT 201 Filing Log",
			{"company": company, "docstatus": 1},
			"name",
			order_by="period_end desc",
		)
		rows.append(
			{
				"company": company,
				"group_role": role,
				"vat_group": group["name"] if group else "",
				"group_trn": group["group_trn"] if group else "",
				"establishments": est_count,
				"head_office": head,
				"last_vat_201": last or "",
			}
		)
	return rows
