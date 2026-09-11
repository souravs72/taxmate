# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, now_datetime

from taxmate.uae_e_invoicing.constants import CONTINGENCY_REPORT_DAYS


class UAEEInvoiceContingency(Document):
	def validate(self):
		if not self.started_on:
			return
		self.report_due = add_days(getdate(self.started_on), CONTINGENCY_REPORT_DAYS)
		if self.reported_to_fta and not self.reported_on:
			self.reported_on = now_datetime()
		if self.ended_on and self.reported_to_fta:
			self.status = "Closed"
		elif self.status == "Closed" and not (self.ended_on and self.reported_to_fta):
			frappe.throw(_("Close only after downtime has ended and the FTA has been notified."))
		if self.ended_on and getdate(self.ended_on) < getdate(self.started_on):
			frappe.throw(_("Downtime Ended cannot be before Downtime Started."))
