# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""Accepted e-invoices vs VAT 201 Box 1 for the same company and period."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import flt, getdate


def execute(filters=None):
	if not frappe.has_permission("UAE E-Invoice Log", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	filters = filters or {}
	columns = get_columns()
	if not filters.get("company") or not filters.get("from_date") or not filters.get("to_date"):
		return columns, []
	if getdate(filters["from_date"]) > getdate(filters["to_date"]):
		frappe.throw(_("From Date cannot be after To Date."))
	if not frappe.has_permission("Company", "read", filters["company"]):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from taxmate.uae_e_invoicing.utils.mandate import setting_on
	from taxmate.uae_vat.utils.vat_201 import _box_1_item_predicates, compute_vat_201

	result = compute_vat_201(filters["company"], filters["from_date"], filters["to_date"])
	box1_amount = sum(row["amount"] for row in result["boxes"] if _is_box1(row["box_no"]))
	box1_vat = sum(row["vat_amount"] for row in result["boxes"] if _is_box1(row["box_no"]))

	category_join, category_filter = _box_1_item_predicates()
	box1_exists = f"""
		exists (
			select 1 from `tabSales Invoice Item` i
			{category_join}
			where i.parent = si.name
				and ifnull(i.is_exempt, 0) != 1
				and ifnull(i.is_zero_rated, 0) != 1
				{category_filter}
		)
	"""
	accepted = frappe.db.sql(
		f"""
		select log.reference_name, log.taxable_amount, log.vat_amount, log.status
		from `tabUAE E-Invoice Log` log
		inner join `tabSales Invoice` si on si.name = log.reference_name
		where log.reference_doctype = 'Sales Invoice' and log.status = 'Accepted'
			and si.docstatus = 1 and si.company = %(company)s
			and si.posting_date between %(from_date)s and %(to_date)s
			and {box1_exists}
		""",
		filters,
		as_dict=True,
	)
	accepted_amount = flt(sum(row.taxable_amount or 0 for row in accepted), 2)
	accepted_vat = flt(sum(row.vat_amount or 0 for row in accepted), 2)

	query_filters = dict(filters)
	query_filters["exclude_b2c"] = 1 if setting_on("exclude_b2c_e_invoices", default=1) else 0
	enabled_clause = ""
	if frappe.db.has_column("Company", "uae_e_invoice_enabled"):
		enabled_clause = """
			and exists (
				select 1 from `tabCompany` c
				where c.name = si.company and c.uae_e_invoice_enabled = 1
			)
		"""
	b2b_clause = """
		and (
			%(exclude_b2c)s = 0
			or exists (
				select 1 from `tabCustomer` cust
				where cust.name = si.customer
					and replace(ifnull(cust.tax_id, ''), ' ', '') regexp '^[0-9]{15}$'
			)
		)
	"""
	missing = frappe.db.sql(
		f"""
		select si.name as reference_name, si.base_net_total as taxable_amount,
			si.base_total_taxes_and_charges as vat_amount, 'Missing Accepted' as status
		from `tabSales Invoice` si
		where si.docstatus = 1 and si.company = %(company)s
			and si.posting_date between %(from_date)s and %(to_date)s
			and {box1_exists}
			and not exists (
				select 1 from `tabUAE E-Invoice Log` log
				where log.reference_doctype = 'Sales Invoice'
					and log.reference_name = si.name and log.status = 'Accepted'
			)
			{enabled_clause}
			{b2b_clause}
		""",
		query_filters,
		as_dict=True,
	)

	b2c_excluded = []
	if query_filters["exclude_b2c"]:
		b2c_excluded = frappe.db.sql(
			f"""
			select si.name as reference_name, si.base_net_total as taxable_amount,
				si.base_total_taxes_and_charges as vat_amount, 'B2C excluded' as status
			from `tabSales Invoice` si
			where si.docstatus = 1 and si.company = %(company)s
				and si.posting_date between %(from_date)s and %(to_date)s
				and {box1_exists}
				and not exists (
					select 1 from `tabCustomer` cust
					where cust.name = si.customer
						and replace(ifnull(cust.tax_id, ''), ' ', '') regexp '^[0-9]{15}$'
				)
			""",
			query_filters,
			as_dict=True,
		)

	diff_amount = flt(box1_amount - accepted_amount, 2)
	diff_vat = flt(box1_vat - accepted_vat, 2)
	data = [
		{
			"reference_name": _("VAT 201 Box 1"),
			"taxable_amount": box1_amount,
			"vat_amount": box1_vat,
			"status": _("Worksheet"),
		},
		{
			"reference_name": _("Accepted e-invoices"),
			"taxable_amount": accepted_amount,
			"vat_amount": accepted_vat,
			"status": _("Archive"),
		},
		{
			"reference_name": _("Difference (Box 1 − Accepted)"),
			"taxable_amount": diff_amount,
			"vat_amount": diff_vat,
			"status": _("Mismatch") if diff_amount or diff_vat else _("OK"),
		},
	]
	data.extend(missing)
	data.extend(b2c_excluded)
	return columns, data


def _is_box1(box_no) -> bool:
	text = str(box_no or "")
	return len(text) >= 2 and text[0] == "1" and text[1:].isalpha()


def get_columns():
	return [
		{"fieldname": "reference_name", "label": _("Invoice / Line"), "fieldtype": "Data", "width": 240},
		{"fieldname": "taxable_amount", "label": _("Amount (AED)"), "fieldtype": "Currency", "options": "AED", "width": 140},
		{"fieldname": "vat_amount", "label": _("VAT (AED)"), "fieldtype": "Currency", "options": "AED", "width": 120},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 140},
	]
