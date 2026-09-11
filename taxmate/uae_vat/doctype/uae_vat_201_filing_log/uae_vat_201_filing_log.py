# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, now_datetime

from taxmate.uae_vat.utils.vat_201 import compute_vat_201


class UAEVAT201FilingLog(Document):
	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))
		self.filing_due_date = add_days(getdate(self.period_end), 28)

	def before_submit(self):
		"""Submitting IS "marking as filed" -- Frappe's own docstatus lock is what
		actually makes this immutable afterwards (System Manager / Accounts
		Manager can still Cancel + Amend for a correction, which is the
		auditable way to revise a filed return; a plain edit is not)."""
		if not self.boxes:
			frappe.throw(_("Generate the VAT 201 boxes before submitting (filing) this log."))
		self.filed_on = now_datetime()
		self.filed_by = frappe.session.user

	# on_cancel: no extra handling needed -- Frappe moves docstatus to 2 and
	# child table rows (the boxes) cancel with the parent automatically.
	# filed_on / filed_by are deliberately left as-is, as history of what was
	# originally filed; only the amended copy (docstatus 0) gets edited further.

	@frappe.whitelist()
	def generate(self):
		"""(Re-)compute VAT 201 boxes from the ledger plus the manual Box 6/7 entries.

		Only usable while the log is a Draft. Once submitted, the document is
		locked by Frappe's own docstatus mechanism -- correct it via Cancel +
		Amend, not by trying to regenerate a filed return in place.
		"""
		self.check_permission("write")
		if self.docstatus != 0:
			frappe.throw(_("This filing is already submitted. Amend it instead of regenerating it in place."))

		result = compute_vat_201(
			company=self.company,
			period_start=self.period_start,
			period_end=self.period_end,
			box_6_amount=self.box_6_amount or 0,
			box_6_vat_amount=self.box_6_vat_amount or 0,
			box_7_amount=self.box_7_amount or 0,
			box_7_vat_amount=self.box_7_vat_amount or 0,
		)

		self.set("boxes", [])
		for row in result["boxes"]:
			self.append(
				"boxes",
				{
					"box_no": row["box_no"],
					"legend": row["legend"],
					"amount": row["amount"],
					"vat_amount": row["vat_amount"],
					"is_subtotal": row["is_subtotal"],
				},
			)
		self.net_vat_due = result["net_vat_due"]
		self.generated_on = now_datetime()
		self.save()
		return result


@frappe.whitelist()
def get_or_create(company: str, period_start, period_end) -> str:
	"""Return the name of the filing log for this company/period, creating a Draft if needed."""
	if not frappe.has_permission("UAE VAT 201 Filing Log", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	existing = frappe.db.get_value(
		"UAE VAT 201 Filing Log",
		{"company": company, "period_start": period_start, "period_end": period_end, "docstatus": ["!=", 2]},
		"name",
	)
	if existing:
		return existing

	doc = frappe.get_doc(
		{
			"doctype": "UAE VAT 201 Filing Log",
			"company": company,
			"period_start": period_start,
			"period_end": period_end,
		}
	)
	doc.insert()
	return doc.name
