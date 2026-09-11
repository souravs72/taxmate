# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class UAETaxSettings(Document):
	def validate(self):
		if self.sla_days is not None and cint(self.sla_days) < 1:
			frappe.throw(_("Transmission SLA Days must be at least 1."))
		if self.archive_retention_years is not None and cint(self.archive_retention_years) < 5:
			frappe.throw(_("Archive Retention must be at least 5 years (FTA minimum)."))
