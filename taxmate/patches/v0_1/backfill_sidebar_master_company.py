"""Ensure custom_company on sidebar masters; backfill Batch from Item."""

from __future__ import annotations

import frappe

from taxmate.setup.company_fields import ENSURE_CUSTOM_COMPANY, ensure_company_link_fields


def execute():
	ensure_company_link_fields()
	companies = set(frappe.get_all("Company", pluck="name"))
	default = frappe.defaults.get_global_default("company")
	if default not in companies:
		default = next(iter(companies), None)

	# Batch: prefer Item.custom_company
	if frappe.db.exists("DocType", "Batch") and frappe.get_meta("Batch").has_field("custom_company"):
		rows = frappe.db.sql(
			"""
			SELECT name, item FROM `tabBatch`
			WHERE IFNULL(custom_company, '') = ''
			""",
			as_dict=True,
		)
		for row in rows:
			comp = None
			if row.item and frappe.get_meta("Item").has_field("custom_company"):
				comp = frappe.db.get_value("Item", row.item, "custom_company")
			if comp not in companies:
				comp = default
			if comp:
				frappe.db.set_value("Batch", row.name, "custom_company", comp, update_modified=False)

	# Other newly ensured masters: leave blank (soft scope keeps them visible)
	# unless Driver has a transporter Supplier with custom_company.
	if frappe.db.exists("DocType", "Driver") and frappe.get_meta("Driver").has_field("custom_company"):
		for name, transporter in frappe.db.sql(
			"""
			SELECT name, transporter FROM `tabDriver`
			WHERE IFNULL(custom_company, '') = '' AND IFNULL(transporter, '') != ''
			"""
		):
			comp = None
			if frappe.get_meta("Supplier").has_field("custom_company"):
				comp = frappe.db.get_value("Supplier", transporter, "custom_company")
			if comp in companies:
				frappe.db.set_value("Driver", name, "custom_company", comp, update_modified=False)

	# Mode of Payment: stamp from Mode of Payment Account when single-company
	if frappe.db.exists("DocType", "Mode of Payment") and frappe.get_meta("Mode of Payment").has_field(
		"custom_company"
	):
		for mop in frappe.get_all(
			"Mode of Payment",
			filters={"custom_company": ["in", ["", None]]},
			pluck="name",
		):
			cos = frappe.get_all(
				"Mode of Payment Account",
				filters={"parent": mop},
				pluck="company",
			)
			cos = [c for c in cos if c in companies]
			uniq = list(dict.fromkeys(cos))
			if len(uniq) == 1:
				frappe.db.set_value("Mode of Payment", mop, "custom_company", uniq[0], update_modified=False)
