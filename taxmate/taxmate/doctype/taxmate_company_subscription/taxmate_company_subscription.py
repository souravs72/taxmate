# Copyright (c) 2026, Sourav Singh and contributors
# License: MIT

import frappe
from frappe.model.document import Document


class TaxMateCompanySubscription(Document):
	def validate(self):
		if self.company and frappe.db.exists(
			self.doctype, {"company": self.company, "name": ["!=", self.name or ""]}
		):
			frappe.throw(frappe._("A subscription already exists for company {0}").format(self.company))
