# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""UAE CT Withholding Entry — tracker only, not an FTA filing.

Callers: Desk users (Accounts Manager/System Manager).
Schema: UAE CT Withholding Entry. tax = amount * rate / 100.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt


class UAECTWithholdingEntry(Document):
	def validate(self):
		from taxmate.uae_corporate_tax.utils.corporate_tax import get_ct_settings

		if not cint(get_ct_settings(self.company).get("enable_withholding")):
			frappe.throw(
				_("Enable Withholding Tracker on UAE CT Settings for {0} first.").format(self.company)
			)
		if flt(self.amount) < 0:
			frappe.throw(_("Amount cannot be negative."))
		if flt(self.rate) < 0:
			frappe.throw(_("Rate cannot be negative."))
		self.tax = flt(flt(self.amount) * flt(self.rate) / 100.0, 2)
