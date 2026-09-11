# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, now_datetime

from taxmate.uae.constants import UAE_COUNTRY


class UAEFTAAuditPack(Document):
	def validate(self):
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("FTA audit packs are only for UAE companies."))
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))

	def before_submit(self):
		if not self.pack_file:
			from taxmate.uae_vat.utils.audit_pack import export_audit_zip

			result = export_audit_zip(self)
			self.pack_file = result.get("file_name")
			self.generated_on = now_datetime()
		if not self.pack_file:
			frappe.throw(_("Generate the audit zip before submitting."))

	@frappe.whitelist()
	def generate(self):
		self.check_permission("write")
		if self.docstatus != 0:
			frappe.throw(_("This pack is submitted. Cancel and amend instead of regenerating in place."))
		from taxmate.uae_vat.utils.audit_pack import export_audit_zip

		result = export_audit_zip(self)
		self.pack_file = result.get("file_name")
		self.generated_on = now_datetime()
		self.save()
		return result
