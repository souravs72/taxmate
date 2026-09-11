# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class UAEVATAuditEvent(Document):
	def before_insert(self):
		if not self.flags.get("from_vat_audit"):
			frappe.throw(_("VAT audit events are written automatically when recoverability or Box 6/7 values change."))
