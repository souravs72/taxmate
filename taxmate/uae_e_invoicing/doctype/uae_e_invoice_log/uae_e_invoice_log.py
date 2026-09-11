# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document

from taxmate.uae_e_invoicing.utils.mandate import get_retention_years


class UAEEInvoiceLog(Document):
	def on_trash(self):
		if self.status not in ("Accepted", "Submitted"):
			return
		frappe.throw(
			_(
				"Do not delete a submitted or accepted e-invoice log. "
				"Keep the signed archive for at least {0} years."
			).format(get_retention_years()),
			title=_("E-Invoice Retention"),
		)
