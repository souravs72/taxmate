# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.utils.period_lock import validate_period_lock
from taxmate.uae_vat.utils.special_regimes import bad_debt_eligible


class UAEBadDebtRelief(Document):
	def validate(self):
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("Bad-debt relief is only for UAE companies."))
		_assert_one_active_claim(self)
		validate_period_lock(self, self.write_off_date)
		invoice = frappe.db.get_value(
			"Sales Invoice",
			self.sales_invoice,
			["company", "docstatus", "due_date", "base_net_total", "base_total_taxes_and_charges"],
			as_dict=True,
		)
		if not invoice:
			frappe.throw(_("Sales Invoice {0} was not found.").format(self.sales_invoice))
		if invoice.company != self.company:
			frappe.throw(_("Invoice {0} belongs to {1}.").format(self.sales_invoice, invoice.company))
		if invoice.docstatus != 1:
			frappe.throw(_("Relief can only be claimed against a submitted Sales Invoice."))
		if not self.due_date and invoice.due_date:
			self.due_date = invoice.due_date
		defaults = _relief_defaults(self.sales_invoice, invoice)
		if not self.taxable_amount:
			self.taxable_amount = defaults["taxable_amount"]
		if not self.vat_amount:
			self.vat_amount = defaults["vat_amount"]
		if flt(self.vat_amount) <= 0:
			frappe.throw(_("Output VAT to relieve must be greater than zero."))

	def before_submit(self):
		if not bad_debt_eligible(self.due_date, self.write_off_date):
			frappe.throw(
				_("Write-off date must be at least six months after the consideration due date."),
				title=_("Bad-Debt Waiting Period"),
			)
		if not self.evidence:
			frappe.throw(_("Attach write-off evidence before submitting."))

	def before_cancel(self):
		validate_period_lock(self, self.write_off_date)


def _assert_one_active_claim(doc) -> None:
	existing = frappe.db.exists(
		"UAE Bad Debt Relief",
		{
			"sales_invoice": doc.sales_invoice,
			"docstatus": ["<", 2],
			"name": ["!=", doc.name or ""],
		},
	)
	if existing:
		frappe.throw(
			_("Bad-debt relief {0} already covers invoice {1}. Cancel or amend that claim first.").format(
				existing, doc.sales_invoice
			)
		)


def _relief_defaults(sales_invoice, invoice) -> dict:
	"""Use the margin that hit Box 1 when the invoice was a margin-scheme supply."""
	if frappe.db.has_column("Sales Invoice Item", "uae_is_margin_scheme"):
		row = frappe.db.sql(
			"""
			select sum(ifnull(uae_margin_amount, 0)) as taxable_amount,
				sum(ifnull(uae_margin_vat, 0)) as vat_amount
			from `tabSales Invoice Item`
			where parent = %s and ifnull(uae_is_margin_scheme, 0) = 1
			""",
			sales_invoice,
			as_dict=True,
		)
		margin = row[0] if row else {}
		if flt(margin.get("taxable_amount")) or flt(margin.get("vat_amount")):
			return {
				"taxable_amount": flt(margin.get("taxable_amount")),
				"vat_amount": flt(margin.get("vat_amount")),
			}
	return {
		"taxable_amount": invoice.base_net_total,
		"vat_amount": invoice.base_total_taxes_and_charges,
	}
