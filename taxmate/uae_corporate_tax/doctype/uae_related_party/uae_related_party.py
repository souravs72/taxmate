# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""UAE Related Party — transfer-pricing flag list for Corporate Tax.

Callers: Desk users (Accounts Manager/System Manager),
taxmate.uae_corporate_tax.utils.corporate_tax.party_is_related / list_related_party_invoices.
Schema: UAE Related Party. Unique company + party_type + party in validate.
"""

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document


class UAERelatedParty(Document):
	def validate(self):
		existing = frappe.db.get_value(
			"UAE Related Party",
			{
				"company": self.company,
				"party_type": self.party_type,
				"party": self.party,
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("{0} {1} is already listed as a related party for {2} ({3}).").format(
					self.party_type, self.party, self.company, existing
				),
				title=_("Duplicate Related Party"),
			)
