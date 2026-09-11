# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""One row per UAE company showing UBO register and ESR filing status side by side."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae.constants import UAE_COUNTRY


def execute(filters=None):
	filters = filters or {}
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{"label": _("Company"), "fieldname": "company", "fieldtype": "Link", "options": "Company", "width": 200},
		{"label": _("UBO Status"), "fieldname": "ubo_status", "fieldtype": "Data", "width": 160},
		{
			"label": _("UBO Register"),
			"fieldname": "ubo_register",
			"fieldtype": "Link",
			"options": "UAE UBO Register",
			"width": 160,
		},
		{"label": _("Open ESR Filings"), "fieldname": "esr_open_count", "fieldtype": "Int", "width": 130},
		{"label": _("Worst ESR Status"), "fieldname": "esr_worst_status", "fieldtype": "Data", "width": 160},
		{
			"label": _("Latest ESR Filing"),
			"fieldname": "esr_latest",
			"fieldtype": "Link",
			"options": "UAE ESR Filing",
			"width": 180,
		},
	]


# Higher index = more urgent; used to pick the "worst" ESR status across a company's filings
_ESR_SEVERITY = ["Complete", "Not Started", "Notification Filed", "Notification Due", "Report Due", "Overdue"]


def get_data(filters):
	company_filter = {"country": UAE_COUNTRY}
	if filters.get("company"):
		company_filter["name"] = filters["company"]

	companies = frappe.get_all("Company", filters=company_filter, pluck="name")
	rows = []

	for company in companies:
		ubo_status, ubo_register = _ubo_row(company)
		esr_open_count, esr_worst_status, esr_latest = _esr_summary(company)
		rows.append(
			{
				"company": company,
				"ubo_status": ubo_status,
				"ubo_register": ubo_register,
				"esr_open_count": esr_open_count,
				"esr_worst_status": esr_worst_status,
				"esr_latest": esr_latest,
			}
		)

	return rows


def _ubo_row(company: str):
	register = frappe.db.get_value("UAE UBO Register", {"company": company}, ["name", "status"], as_dict=True)
	if not register:
		return _("No Register"), None
	return register.status, register.name


def _esr_summary(company: str):
	filings = frappe.get_all(
		"UAE ESR Filing",
		filters={"company": company},
		fields=["name", "status", "financial_year_end"],
		order_by="financial_year_end desc",
	)
	if not filings:
		return 0, _("No Filings"), None

	open_count = sum(1 for f in filings if f.status != "Complete")
	worst = max(filings, key=lambda f: _ESR_SEVERITY.index(f.status) if f.status in _ESR_SEVERITY else 0)
	return open_count, worst.status, filings[0].name
