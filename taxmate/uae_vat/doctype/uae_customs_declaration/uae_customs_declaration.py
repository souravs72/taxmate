# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.utils.period_lock import validate_period_lock


class UAECustomsDeclaration(Document):
	def validate(self):
		country = frappe.db.get_value("Company", self.company, "country")
		if country != UAE_COUNTRY:
			frappe.throw(
				_("UAE Customs Declaration is only for companies in {0}.").format(UAE_COUNTRY),
				title=_("Not a UAE Company"),
			)
		if self.purchase_invoice:
			pi_company = frappe.db.get_value("Purchase Invoice", self.purchase_invoice, "company")
			if pi_company and pi_company != self.company:
				frappe.throw(
					_("Purchase Invoice {0} belongs to {1}, not {2}.").format(
						self.purchase_invoice, pi_company, self.company
					)
				)
		if self.get("landed_cost_voucher") and frappe.db.exists("DocType", "Landed Cost Voucher"):
			lcv_company = frappe.db.get_value("Landed Cost Voucher", self.landed_cost_voucher, "company")
			if lcv_company and lcv_company != self.company:
				frappe.throw(
					_("Landed Cost Voucher {0} belongs to {1}, not {2}.").format(
						self.landed_cost_voucher, lcv_company, self.company
					)
				)
		validate_period_lock(self)

	def before_cancel(self):
		validate_period_lock(self)
