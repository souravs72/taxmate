# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import nowdate

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.utils.late_filing import NOT_LEGAL_ADVICE, days_late, notice_status


class UAELateFilingNotice(Document):
	def validate(self):
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("Late filing notices are only for UAE companies."))
		if self.status != "Cleared":
			self.days_late = days_late(self.due_date, nowdate())
			self.status = notice_status(self.due_date, nowdate(), cleared=False)
		else:
			self.days_late = 0
		if not self.guidance:
			self.guidance = NOT_LEGAL_ADVICE
