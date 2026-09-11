# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_e_invoicing.utils.mandate import vat_group_tin
from taxmate.uae_vat.utils.vat_group import date_windows_overlap


class UAEVATGroup(Document):
	def validate(self):
		rep_country = frappe.db.get_value("Company", self.representative_company, "country")
		if rep_country != UAE_COUNTRY:
			frappe.throw(_("VAT groups are only for UAE companies."))
		trn = frappe.db.get_value("Company", self.representative_company, "tax_id")
		self.group_trn = vat_group_tin(trn) or ""
		if not self.members:
			frappe.throw(_("Add at least two member companies, including the representative."))
		seen = set()
		rep_rows = 0
		for row in self.members:
			if row.to_date and getdate(row.to_date) < getdate(row.from_date):
				frappe.throw(_("Row #{0}: Member To cannot be before Member From.").format(row.idx))
			country = frappe.db.get_value("Company", row.company, "country")
			if country != UAE_COUNTRY:
				frappe.throw(_("Row #{0}: {1} is not a UAE company.").format(row.idx, row.company))
			if row.company in seen:
				frappe.throw(_("Row #{0}: {1} is listed twice.").format(row.idx, row.company))
			seen.add(row.company)
			if row.is_representative:
				rep_rows += 1
				if row.company != self.representative_company:
					frappe.throw(_("The representative flag must match Representative Company."))
		if self.representative_company not in seen:
			frappe.throw(_("Add the representative company as a member row."))
		if rep_rows != 1:
			frappe.throw(_("Tick Representative on exactly one member row."))
		if len(seen) < 2:
			frappe.throw(_("A VAT group needs at least two companies."))
		self._assert_no_cross_group_overlap()

	def before_cancel(self):
		filing = frappe.db.get_value(
			"UAE VAT 201 Filing Log",
			{"vat_group": self.name, "docstatus": 1},
			"name",
		)
		if filing:
			frappe.throw(
				_("Cancel submitted VAT 201 {0} before cancelling this VAT group.").format(filing)
			)

	def _assert_no_cross_group_overlap(self):
		others = frappe.get_all(
			"UAE VAT Group",
			filters={"docstatus": ["<", 2], "name": ["!=", self.name or ""]},
			pluck="name",
		)
		for other in others:
			rows = frappe.get_all(
				"UAE VAT Group Member",
				filters={"parent": other, "parenttype": "UAE VAT Group"},
				fields=["company", "from_date", "to_date"],
			)
			for mine in self.members:
				for theirs in rows:
					if mine.company != theirs.company:
						continue
					if date_windows_overlap(mine.from_date, mine.to_date, theirs.from_date, theirs.to_date):
						frappe.throw(
							_(
								"{0} is already in VAT group {1} for an overlapping period. "
								"Cancel or end that membership first."
							).format(mine.company, other)
						)
