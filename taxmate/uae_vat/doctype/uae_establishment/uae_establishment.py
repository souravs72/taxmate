# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document

from taxmate.uae.constants import UAE_COUNTRY


class UAEEstablishment(Document):
	def validate(self):
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("Establishments are only for UAE companies."))
		if self.cost_center:
			cc_company = frappe.db.get_value("Cost Center", self.cost_center, "company")
			if cc_company and cc_company != self.company:
				frappe.throw(
					_("Cost Center {0} belongs to {1}, not {2}.").format(
						self.cost_center, cc_company, self.company
					)
				)
		if self.is_head_office:
			existing = frappe.db.exists(
				"UAE Establishment",
				{
					"company": self.company,
					"is_head_office": 1,
					"name": ["!=", self.name or ""],
				},
			)
			if existing:
				frappe.throw(
					_("Head office is already {0}. Untick that record first.").format(existing)
				)
