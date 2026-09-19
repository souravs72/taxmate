# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.constants.special_regimes import DEFAULT_EXCISE_RATES
from taxmate.uae_vat.utils.special_regimes import excise_tax


class UAEExciseFilingLog(Document):
	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("UAE Excise Filing Log is only for UAE companies."))
		total = 0.0
		for row in self.lines or []:
			if row.sales_invoice:
				si_company = frappe.db.get_value("Sales Invoice", row.sales_invoice, "company")
				if si_company and si_company != self.company:
					frappe.throw(
						_("Row #{0}: Sales Invoice {1} belongs to {2}, not {3}.").format(
							row.idx, row.sales_invoice, si_company, self.company
						)
					)
			row.excise_amount = excise_tax(row.taxable_base, row.rate_percent)
			total += flt(row.excise_amount)
		self.total_excise = flt(total, 2)

	def before_submit(self):
		if not self.lines:
			frappe.throw(_("Generate at least one excise line before submitting."))
		if not self.filed_on:
			frappe.throw(_("Set Filed On after you file through the FTA excise portal."))

	@frappe.whitelist()
	def generate(self):
		self.check_permission("write")
		if self.docstatus != 0:
			frappe.throw(_("This filing is already submitted. Amend it instead of regenerating it."))
		settings = frappe.get_single("UAE Excise Settings")
		if not settings.enable_excise:
			frappe.throw(_("Enable excise tracking on UAE Excise Settings first."))
		rates = {row.category: row.rate_percent for row in (settings.rates or [])}
		for category, default in DEFAULT_EXCISE_RATES.items():
			rates.setdefault(category, default)
		if not frappe.db.has_column("Item", "uae_excise_category"):
			frappe.throw(_("Item.uae_excise_category is missing. Run migrate."))
		rows = frappe.db.sql(
			"""
			select i.item_code, i.uae_excise_category as category, s.name as sales_invoice,
				sum(i.base_net_amount) as taxable_base
			from `tabSales Invoice Item` i
			inner join `tabSales Invoice` s on i.parent = s.name
			where s.docstatus = 1 and s.company = %(company)s
				and s.posting_date between %(from_date)s and %(to_date)s
				and ifnull(i.uae_excise_category, '') != ''
			group by i.item_code, i.uae_excise_category, s.name
			""",
			{"company": self.company, "from_date": self.period_start, "to_date": self.period_end},
			as_dict=True,
		)
		self.set("lines", [])
		for row in rows:
			rate = rates.get(row.category)
			self.append(
				"lines",
				{
					"item_code": row.item_code,
					"category": row.category,
					"sales_invoice": row.sales_invoice,
					"taxable_base": row.taxable_base,
					"rate_percent": rate,
					"excise_amount": excise_tax(row.taxable_base, rate),
				},
			)
		self.save()
		return self.name
