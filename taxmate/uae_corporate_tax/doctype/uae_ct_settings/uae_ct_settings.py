# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class UAECTSettings(Document):
	def validate(self):
		if cint(self.elect_small_business_relief) and cint(self.elect_qfzp):
			frappe.throw(_("Small Business Relief and QFZP cannot be elected together."))
		if self.standard_rate is not None and self.standard_rate < 0:
			frappe.throw(_("Standard Rate cannot be negative."))
		if self.zero_rate_band is not None and self.zero_rate_band < 0:
			frappe.throw(_("0% Band cannot be negative."))
		if self.sbr_revenue_threshold is not None and self.sbr_revenue_threshold < 0:
			frappe.throw(_("SBR Revenue Threshold cannot be negative."))
		if self.de_minimis_percent is not None and self.de_minimis_percent < 0:
			frappe.throw(_("De Minimis percent cannot be negative."))
		if self.de_minimis_amount is not None and self.de_minimis_amount < 0:
			frappe.throw(_("De Minimis cap cannot be negative."))
		if self.reminder_days is not None and cint(self.reminder_days) < 1:
			frappe.throw(_("Reminder Lead Days must be at least 1."))
