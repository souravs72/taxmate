# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, cint, getdate, now_datetime

from taxmate.uae.validation import normalize_trn, validate_trn
from taxmate.uae_vat.constants.tenancy import AUDIT_VAT201_FIELDS
from taxmate.uae_vat.utils.vat_201 import (
	append_vat_201_totals,
	compute_vat_201,
	filing_deadline_status,
	reminder_lead_days,
	sum_customs_declarations,
)
from taxmate.uae_vat.utils.vat_audit import log_field_changes
from taxmate.uae_vat.utils.vat_group import active_group_for_company, members_in_period, merge_vat_201_boxes


class UAEVAT201FilingLog(Document):
	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))
		self.filing_due_date = add_days(getdate(self.period_end), 28)
		self._assert_unique_period()
		self._assert_group_filing_rules()
		self._set_company_trn()
		if hasattr(self, "deadline_status"):
			self.deadline_status = filing_deadline_status(
				self.filing_due_date, self.docstatus, lead_days=reminder_lead_days()
			)
		log_field_changes(self, AUDIT_VAT201_FIELDS)

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
		result = None
		if cint(self.get("include_group_members")) and self.vat_group:
			result = self._compute_group_return()
		else:
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
		self._apply_compute_result(result)
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
		if cint(self.get("include_group_members")) and self.vat_group:
			group_trn = frappe.db.get_value("UAE VAT Group", self.vat_group, "group_trn") or ""
			self.company_trn = group_trn
			if required and not group_trn:
				frappe.throw(
					_("Set Tax ID (TRN) on the representative company so the VAT Group TIN can be snapshotted."),
					title=_("VAT Group TIN Required"),
				)
			return
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

	def _assert_group_filing_rules(self) -> None:
		if not self.meta.has_field("vat_group"):
			return
		group = active_group_for_company(self.company, self.period_end)
		if group and not self.vat_group:
			self.vat_group = group["name"]
		if group and group["is_representative"] and not cint(self.get("include_group_members")):
			frappe.throw(
				_(
					"{0} is the representative of VAT group {1}. Tick Include Group Members "
					"and file one return for the group — members must not file separately."
				).format(self.company, group["name"])
			)
		if group and not group["is_representative"] and not cint(self.get("include_group_members")):
			frappe.throw(
				_(
					"{0} is a member of VAT group {1}. File VAT 201 on representative {2} "
					"with Include Group Members ticked."
				).format(self.company, group["name"], group["representative_company"])
			)
		if cint(self.get("include_group_members")):
			if not self.vat_group:
				frappe.throw(_("Set VAT Group before including members."))
			rep = frappe.db.get_value("UAE VAT Group", self.vat_group, "representative_company")
			if rep != self.company:
				frappe.throw(_("Only the representative company {0} can file a group VAT 201.").format(rep))
			if frappe.db.get_value("UAE VAT Group", self.vat_group, "docstatus") != 1:
				frappe.throw(_("Submit the VAT Group election before filing a group return."))

	def _compute_group_return(self) -> dict:
		from taxmate.uae_e_invoicing.constants import AED_CURRENCY
		from taxmate.uae_vat.utils.tax_currency import company_to_aed_rate, to_aed

		companies = members_in_period(self.vat_group, self.period_start, self.period_end)
		if self.company not in companies:
			frappe.throw(_("Representative {0} is not a member of {1} in this period.").format(self.company, self.vat_group))
		results = []
		box_6 = box_6_vat = box_7 = box_7_vat = 0.0
		for company in companies:
			customs = sum_customs_declarations(company, self.period_start, self.period_end)
			rate = company_to_aed_rate(company, self.period_end)
			box_6 += to_aed(customs["box_6_amount"], rate)
			box_6_vat += to_aed(customs["box_6_vat_amount"], rate)
			box_7 += to_aed(customs["box_7_amount"], rate)
			box_7_vat += to_aed(customs["box_7_vat_amount"], rate)
			if self.get("boxes_6_7_manual"):
				results.append(
					compute_vat_201(
						company, self.period_start, self.period_end, 0, 0, 0, 0
					)
				)
			else:
				results.append(
					compute_vat_201(
						company,
						self.period_start,
						self.period_end,
						customs["box_6_amount"],
						customs["box_6_vat_amount"],
						customs["box_7_amount"],
						customs["box_7_vat_amount"],
					)
				)
		if not self.get("boxes_6_7_manual"):
			self.box_6_amount = box_6
			self.box_6_vat_amount = box_6_vat
			self.box_7_amount = box_7
			self.box_7_vat_amount = box_7_vat
		detail = merge_vat_201_boxes(results)
		if self.get("boxes_6_7_manual"):
			detail = [row for row in detail if row["box_no"] not in {"6", "7"}]
			detail.append({"box_no": "6", "legend": _("Goods imported into the UAE"), "amount": self.box_6_amount or 0, "vat_amount": self.box_6_vat_amount or 0, "is_subtotal": 0})
			detail.append({"box_no": "7", "legend": _("Adjustments to goods imported into the UAE"), "amount": self.box_7_amount or 0, "vat_amount": self.box_7_vat_amount or 0, "is_subtotal": 0})
		boxes, totals = append_vat_201_totals(detail)
		return {
			"boxes": boxes,
			**totals,
			"tax_currency": AED_CURRENCY,
			"tax_currency_rate": 1.0,
		}

	def _apply_compute_result(self, result: dict) -> None:
		self.set("boxes", [])
		for row in result["boxes"]:
			self.append(
				"boxes",
				{
					"box_no": row["box_no"],
					"legend": row["legend"],
					"amount": row["amount"],
					"vat_amount": row["vat_amount"],
					"is_subtotal": row.get("is_subtotal"),
				},
			)
		self.net_vat_due = result["net_vat_due"]
		if self.meta.has_field("tax_currency"):
			self.tax_currency = result.get("tax_currency") or "AED"
			self.tax_currency_rate = result.get("tax_currency_rate") or 1
		self.generated_on = now_datetime()


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
