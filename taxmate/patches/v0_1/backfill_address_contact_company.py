"""Stamp Address/Contact.custom_company from Dynamic Links / party / company."""

from __future__ import annotations

import frappe

from taxmate.setup.company_fields import ensure_company_link_fields


def execute():
	ensure_company_link_fields()
	frappe.clear_cache(doctype="Address")
	frappe.clear_cache(doctype="Contact")
	companies = set(frappe.get_all("Company", pluck="name"))
	default = frappe.defaults.get_global_default("company")
	if default not in companies:
		default = next(iter(companies), None)

	for doctype in ("Address", "Contact"):
		if not frappe.get_meta(doctype).has_field("custom_company"):
			continue
		rows = frappe.db.sql(
			f"""
			SELECT name FROM `tab{doctype}`
			WHERE IFNULL(custom_company, '') = ''
			""",
			as_dict=True,
		)
		for row in rows:
			comp = _resolve(doctype, row.name, companies) or default
			if comp:
				frappe.db.set_value(doctype, row.name, "custom_company", comp, update_modified=False)


def _resolve(doctype: str, name: str, companies: set[str]) -> str | None:
	links = frappe.get_all(
		"Dynamic Link",
		filters={"parenttype": doctype, "parent": name},
		fields=["link_doctype", "link_name"],
	)
	for link in links:
		dt, ln = link.link_doctype, link.link_name
		if not dt or not ln:
			continue
		if dt == "Company" and ln in companies:
			return ln
		if dt in ("Customer", "Supplier") and frappe.get_meta(dt).has_field("custom_company"):
			comp = frappe.db.get_value(dt, ln, "custom_company")
			if comp in companies:
				return comp
		if frappe.db.exists("DocType", dt) and frappe.get_meta(dt).has_field("company"):
			comp = frappe.db.get_value(dt, ln, "company")
			if comp in companies:
				return comp
	return None
