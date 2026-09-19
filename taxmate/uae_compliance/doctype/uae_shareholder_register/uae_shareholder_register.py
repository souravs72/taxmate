# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""UAE Shareholder Register — legal ownership (Cabinet Decision 109), not UBO."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt

from taxmate.uae_compliance.utils.ownership import nominee_named, shareholder_register_status


class UAEShareholderRegister(Document):
	def validate(self):
		active = 0
		for row in self.shareholders or []:
			if flt(row.ownership_percentage) < 0:
				frappe.throw(_("Row #{0}: ownership cannot be negative.").format(row.idx))
			if not row.is_active and not row.ceased_on:
				frappe.throw(
					_("Row #{0}: set Ceased On for {1}.").format(row.idx, row.holder_name)
				)
			if row.is_active and row.ceased_on:
				frappe.throw(
					_("Row #{0}: {1} has Ceased On but is still marked active.").format(
						row.idx, row.holder_name
					)
				)
			if not nominee_named(cint(row.is_nominee), row.nominee_for):
				frappe.throw(
					_("Row #{0}: name who {1} holds for as nominee.").format(row.idx, row.holder_name)
				)
			if cint(row.is_active):
				active += 1
		total_pct = sum(flt(row.ownership_percentage) for row in self.shareholders or [] if cint(row.is_active))
		if total_pct > 100.01:
			frappe.throw(
				_("Active legal ownership adds up to {0}%. It cannot exceed 100%.").format(
					frappe.format(total_pct, {"fieldtype": "Percent"})
				)
			)
		self.status = shareholder_register_status(active, register_exists=True)
