# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, getdate, now_datetime

from taxmate.uae.validation import normalize_trn, validate_trn
from taxmate.uae_vat.utils.vat_201 import (
	compute_vat_201,
	filing_deadline_status,
	reminder_lead_days,
	sum_customs_declarations,
)


class UAEVAT201FilingLog(Document):
	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))
		self.filing_due_date = add_days(getdate(self.period_end), 28)
		self._set_company_trn()
		if hasattr(self, "deadline_status"):
			self.deadline_status = filing_deadline_status(
				self.filing_due_date, self.docstatus, lead_days=reminder_lead_days()
			)
		self._assert_unique_period()

	def before_submit(self):
		"""Submitting IS "marking as filed" -- Frappe's own docstatus lock is what
		actually makes this immutable afterwards (System Manager / Accounts
		Manager can still Cancel + Amend for a correction, which is the
		auditable way to revise a filed return; a plain edit is not)."""
		self._set_company_trn(required=True)
		self._assert_no_overlapping_filed_period()
		self._refresh_boxes_from_ledger()
		self.filed_on = now_datetime()
		self.filed_by = frappe.session.user
		self.deadline_status = "Filed"

	# on_cancel: no extra handling needed -- Frappe moves docstatus to 2 and
	# child table rows (the boxes) cancel with the parent automatically.
	# filed_on / filed_by are deliberately left as-is, as history of what was
	# originally filed; only the amended copy (docstatus 0) gets edited further.

	@frappe.whitelist()
	def generate(self):
		"""(Re-)compute VAT 201 boxes from the ledger plus customs (or override) Box 6/7.

		Only usable while the log is a Draft. Once submitted, the document is
		locked by Frappe's own docstatus mechanism -- correct it via Cancel +
		Amend, not by trying to regenerate a filed return in place.
		"""
		self.check_permission("write")
		if self.docstatus != 0:
			frappe.throw(_("This filing is already submitted. Amend it instead of regenerating it in place."))

		result = self._refresh_boxes_from_ledger()
		self.save()
		return result

	def on_submit(self):
		_close_filing_todos(self.name)

	def _refresh_boxes_from_ledger(self):
		self._set_company_trn(required=True)
		if not self.get("boxes_6_7_manual"):
			customs = sum_customs_declarations(self.company, self.period_start, self.period_end)
			self.box_6_amount = customs["box_6_amount"]
			self.box_6_vat_amount = customs["box_6_vat_amount"]
			self.box_7_amount = customs["box_7_amount"]
			self.box_7_vat_amount = customs["box_7_vat_amount"]

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
		return result

	@frappe.whitelist()
	def export_accountant_pack(self):
		from taxmate.uae_vat.utils.vat_201_export import export_accountant_pack

		return export_accountant_pack(self)

	def _assert_unique_period(self) -> None:
		existing = frappe.db.get_value(
			"UAE VAT 201 Filing Log",
			{
				"company": self.company,
				"period_start": self.period_start,
				"period_end": self.period_end,
				"docstatus": ["!=", 2],
				"name": ["!=", self.name or ""],
			},
			"name",
		)
		if existing:
			frappe.throw(
				_("VAT 201 Filing Log {0} already covers this company and period.").format(existing),
				title=_("Duplicate VAT 201 Period"),
			)

	def _assert_no_overlapping_filed_period(self) -> None:
		overlap = frappe.db.sql(
			"""
			select name from `tabUAE VAT 201 Filing Log`
			where company = %s and docstatus = 1 and name != %s
				and period_start <= %s and period_end >= %s
			limit 1
			""",
			(self.company, self.name or "", self.period_end, self.period_start),
		)
		if overlap:
			frappe.throw(
				_(
					"Submitted VAT 201 Filing Log {0} already covers overlapping dates. "
					"Cancel that filing before submitting another return for the same books."
				).format(overlap[0][0]),
				title=_("Overlapping VAT 201 Period"),
			)

	def _set_company_trn(self, required: bool = False) -> None:
		trn = normalize_trn(frappe.db.get_value("Company", self.company, "tax_id"))
		self.company_trn = trn
		if required and not trn:
			frappe.throw(
				_(
					"Set Tax ID (TRN) on {0} before generating or filing VAT 201. "
					"Do not file another company's TRN against these books."
				).format(self.company),
				title=_("Company TRN Required"),
			)
		if required and trn:
			validate_trn(trn, _("Company Tax ID (TRN)"))


def _close_filing_todos(name: str) -> None:
	for todo in frappe.get_all(
		"ToDo",
		filters={"reference_type": "UAE VAT 201 Filing Log", "reference_name": name, "status": "Open"},
		pluck="name",
	):
		frappe.db.set_value("ToDo", todo, "status", "Closed")


@frappe.whitelist()
def get_or_create(company: str, period_start, period_end) -> str:
	"""Return the name of the filing log for this company/period, creating a Draft if needed."""
	if not frappe.has_permission("UAE VAT 201 Filing Log", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	existing = frappe.db.get_value(
		"UAE VAT 201 Filing Log",
		{"company": company, "period_start": period_start, "period_end": period_end, "docstatus": ["!=", 2]},
		"name",
	)
	if existing:
		frappe.get_doc("UAE VAT 201 Filing Log", existing).check_permission("read")
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
