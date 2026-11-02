"""Assign custom_company to legacy Customers and Suppliers that lack one.

Ensures strict company isolation so customers/suppliers are never visible
across unrelated companies.
"""

from __future__ import annotations

import frappe


def execute():
	companies = frappe.get_all("Company", pluck="name")
	if not companies:
		return

	default_company = frappe.defaults.get_global_default("company") or companies[0]

	# 1. Backfill Customers
	if frappe.db.exists("DocType", "Customer") and frappe.get_meta("Customer").has_field("custom_company"):
		customers = frappe.db.sql(
			"""
			SELECT name FROM `tabCustomer`
			WHERE custom_company IS NULL OR custom_company = ''
			""",
			as_dict=True,
		)
		for c in customers:
			cname = c.name
			comp = None
			for dt, party_field in (
				("Sales Invoice", "customer"),
				("Sales Order", "customer"),
				("Quotation", "party_name"),
				("Delivery Note", "customer"),
			):
				if frappe.db.exists("DocType", dt):
					comp = frappe.db.get_value(
						dt,
						{party_field: cname, "docstatus": ["!=", 2]},
						"company",
						order_by="creation desc",
					)
					if comp:
						break

			if not comp:
				lower_name = cname.lower()
				for comp_name in companies:
					if lower_name in comp_name.lower() or comp_name.lower() in lower_name:
						comp = comp_name
						break

			if not comp:
				comp = default_company

			frappe.db.set_value("Customer", cname, "custom_company", comp, update_modified=False)

	# 2. Backfill Suppliers
	if frappe.db.exists("DocType", "Supplier") and frappe.get_meta("Supplier").has_field("custom_company"):
		suppliers = frappe.db.sql(
			"""
			SELECT name FROM `tabSupplier`
			WHERE custom_company IS NULL OR custom_company = ''
			""",
			as_dict=True,
		)
		for s in suppliers:
			sname = s.name
			comp = None
			for dt, party_field in (
				("Purchase Invoice", "supplier"),
				("Purchase Order", "supplier"),
				("Purchase Receipt", "supplier"),
			):
				if frappe.db.exists("DocType", dt):
					comp = frappe.db.get_value(
						dt,
						{party_field: sname, "docstatus": ["!=", 2]},
						"company",
						order_by="creation desc",
					)
					if comp:
						break

			if not comp:
				lower_name = sname.lower()
				for comp_name in companies:
					if lower_name in comp_name.lower() or comp_name.lower() in lower_name:
						comp = comp_name
						break

			if not comp:
				comp = default_company

			frappe.db.set_value("Supplier", sname, "custom_company", comp, update_modified=False)
