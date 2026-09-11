# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""UAE CT Filing Log — worksheet and audit lock for Corporate Tax."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate, now_datetime

from taxmate.uae.validation import normalize_trn, validate_trn
from taxmate.uae_corporate_tax.utils.corporate_tax import (
	compute_ct,
	filing_deadline_status,
	filing_due_date,
	get_ct_settings,
)


class UAECTFilingLog(Document):
	def before_insert(self):
		self._copy_elections_from_settings_if_unset()

	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))
		if cint(self.elect_small_business_relief) and cint(self.elect_qfzp):
			frappe.throw(_("Small Business Relief and QFZP cannot be elected in the same tax period."))
		for row in self.adjustments or []:
			if flt(row.amount) < 0:
				frappe.throw(_("Adjustment amounts cannot be negative."))
		self.filing_due_date = filing_due_date(self.period_end)
		self._set_company_trn()
		settings = get_ct_settings(self.company)
		lead_days = cint(settings.get("reminder_days") or 30)
		self.deadline_status = filing_deadline_status(
			self.filing_due_date, self.docstatus, lead_days=lead_days
		)
		self._assert_unique_period()

	def before_submit(self):
		"""Submitting IS "marking as filed" — Frappe's own docstatus lock is what
		actually makes this immutable afterwards (System Manager / Accounts
		Manager can still Cancel + Amend for a correction, which is the
		auditable way to revise a filed return; a plain edit is not).
		"""
		self._set_company_trn(required=True)
		self._assert_no_overlapping_filed_period()
		self._refresh()
		self.filed_on = now_datetime()
		self.filed_by = frappe.session.user
		self.deadline_status = "Filed"

	def on_submit(self):
		_close_filing_todos(self.name)

	@frappe.whitelist()
	def generate(self):
		"""(Re-)compute the CT worksheet from GL + adjustments + elections.

		Only usable while the log is a Draft. Once submitted, the document is
		locked by Frappe's own docstatus mechanism — correct it via Cancel +
		Amend, not by trying to regenerate a filed return in place.
		"""
		self.check_permission("write")
		if self.docstatus != 0:
			frappe.throw(_("This filing is already submitted. Amend it instead of regenerating it in place."))

		result = self._refresh()
		self.save()
		return result

	@frappe.whitelist()
	def export_accountant_pack(self):
		from taxmate.uae_corporate_tax.utils.ct_export import export_accountant_pack

		return export_accountant_pack(self)

	def _refresh(self):
		self._set_company_trn(required=True)
		settings = get_ct_settings(self.company)

		adjustments = [
			{
				"adjustment_type": row.adjustment_type,
				"category": row.category,
				"amount": row.amount,
				"notes": row.notes,
			}
			for row in (self.adjustments or [])
		]
		result = compute_ct(
			company=self.company,
			period_start=self.period_start,
			period_end=self.period_end,
			adjustments=adjustments,
			elect_sbr=cint(self.elect_small_business_relief),
			elect_qfzp=cint(self.elect_qfzp),
			settings=settings,
		)
		self.filing_due_date = result.get("filing_due_date") or self.filing_due_date
		self.regime = result["regime"]
		self.revenue = result["revenue"]
		self.expenses = result["expenses"]
		self.accounting_profit = result["accounting_profit"]
		self.taxable_profit = result["taxable_profit"]
		self.tax_payable = result["tax_payable"]
		self.qualifying_revenue = result["qualifying_revenue"]
		self.non_qualifying_revenue = result["non_qualifying_revenue"]
		self.unclassified_revenue = result["unclassified_revenue"]
		self.de_minimis_limit = result["de_minimis_limit"]
		self.de_minimis_passed = cint(result["de_minimis_passed"])
		self.generated_on = now_datetime()
		return result

	def _assert_unique_period(self) -> None:
		existing = frappe.db.get_value(
			"UAE CT Filing Log",
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
				_("CT Filing Log {0} already covers this company and period.").format(existing),
				title=_("Duplicate CT Period"),
			)

	def _assert_no_overlapping_filed_period(self) -> None:
		overlap = frappe.db.sql(
			"""
			select name from `tabUAE CT Filing Log`
			where company = %s and docstatus = 1 and name != %s
				and period_start <= %s and period_end >= %s
			limit 1
			""",
			(self.company, self.name or "", self.period_end, self.period_start),
		)
		if overlap:
			frappe.throw(
				_(
					"Submitted CT Filing Log {0} already covers overlapping dates. "
					"Cancel that filing before submitting another return for the same books."
				).format(overlap[0][0]),
				title=_("Overlapping CT Period"),
			)

	def _set_company_trn(self, required: bool = False) -> None:
		trn = normalize_trn(frappe.db.get_value("Company", self.company, "tax_id"))
		self.company_trn = trn
		if required and not trn:
			frappe.throw(
				_(
					"Set Tax ID (TRN) on {0} before generating or filing Corporate Tax. "
					"Do not file another company's TRN against these books."
				).format(self.company),
				title=_("Company TRN Required"),
			)
		if required and trn:
			validate_trn(trn, _("Company Tax ID (TRN)"))

	def _copy_elections_from_settings_if_unset(self) -> None:
		"""Seed elections from settings only when both checks are still off."""
		if self.generated_on:
			return
		if cint(self.elect_small_business_relief) or cint(self.elect_qfzp):
			return
		settings = get_ct_settings(self.company)
		self.elect_small_business_relief = cint(settings.get("elect_small_business_relief") or 0)
		self.elect_qfzp = cint(settings.get("elect_qfzp") or 0)


def _close_filing_todos(name: str) -> None:
	for todo in frappe.get_all(
		"ToDo",
		filters={"reference_type": "UAE CT Filing Log", "reference_name": name, "status": "Open"},
		pluck="name",
	):
		frappe.db.set_value("ToDo", todo, "status", "Closed")
