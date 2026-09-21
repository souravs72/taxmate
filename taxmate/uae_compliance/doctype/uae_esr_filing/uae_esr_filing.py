# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from taxmate.uae_compliance.constants import LICENCE_AUTHORITIES
from taxmate.uae_compliance.utils.authorities import resolve_authority_deadlines
from taxmate.uae_compliance.utils.deadlines import (
	esr_filing_status,
	esr_notification_due_date,
	esr_report_due_date,
)
from taxmate.uae_compliance.utils.substance import activity_substance_complete, board_minutes_attached


class UAEESRFiling(Document):
	def before_validate(self):
		known = set(LICENCE_AUTHORITIES)
		if self.licence_authority and not self.regulatory_authority:
			self.regulatory_authority = self.licence_authority
		elif self.regulatory_authority and not self.licence_authority and self.regulatory_authority in known:
			self.licence_authority = self.regulatory_authority

	def validate(self):
		if getdate(self.financial_year_end) < getdate(self.financial_year_start):
			frappe.throw(_("Financial Year End cannot be before Financial Year Start."))

		self._default_due_dates()
		self._validate_exemption()
		self._recompute_status()

	def _default_due_dates(self):
		"""Fill due dates from settings only when blank -- never overwrite a manual override."""
		settings = frappe.get_single("UAE Compliance Settings")
		year_end = getdate(self.financial_year_end)
		windows = resolve_authority_deadlines(
			self.get("licence_authority") or self.get("regulatory_authority"),
			[
				{
					"authority": row.authority,
					"esr_notification_deadline_months": row.esr_notification_deadline_months,
					"esr_report_deadline_months": row.esr_report_deadline_months,
				}
				for row in (settings.get("licence_authorities") or [])
			],
			{
				"esr_notification_deadline_months": settings.esr_notification_deadline_months or 6,
				"esr_report_deadline_months": settings.esr_report_deadline_months or 12,
			},
		)

		if not self.notification_due_date:
			self.notification_due_date = esr_notification_due_date(
				year_end, windows["esr_notification_deadline_months"]
			)
		if not self.report_due_date:
			self.report_due_date = esr_report_due_date(year_end, windows["esr_report_deadline_months"])

	def _validate_exemption(self):
		if self.is_exempt and not self.exemption_reason:
			frappe.throw(_("Set an Exemption Reason when claiming exemption."))
		if self.has_relevant_activity and not self.is_exempt and not self.activities:
			frappe.throw(_("List at least one Relevant Activity, or claim an exemption with a reason."))

	def _recompute_status(self):
		settings = frappe.get_single("UAE Compliance Settings")
		self.status = esr_filing_status(
			is_exempt=bool(self.is_exempt),
			notification_due=getdate(self.notification_due_date),
			notification_filed_on=getdate(self.notification_filed_on) if self.notification_filed_on else None,
			report_due=getdate(self.report_due_date),
			report_filed_on=getdate(self.report_filed_on) if self.report_filed_on else None,
			today=getdate(today()),
			reminder_window_days=settings.esr_reminder_window_days or 30,
		)

	def before_submit(self):
		"""Submitting locks this record as the audit trail of a completed ESR
		filing. Only allow it once there is nothing left to do -- otherwise a
		half-finished filing (e.g. notification filed, report still pending)
		would be frozen and unable to record the report later."""
		if not self.notification_filed_on:
			frappe.throw(
				_(
					"Set 'Notification Filed On' before submitting -- the notification hasn't been recorded yet."
				)
			)
		if not self.is_exempt and not self.report_filed_on:
			frappe.throw(
				_(
					"Set 'Report Filed On' before submitting (this entity is not exempt, so the Economic "
					"Substance Report is required, not just the notification)."
				)
			)
		if self.status != "Complete":
			frappe.throw(_("Status must be Complete before this filing can be submitted."))
		if self.has_relevant_activity and not self.is_exempt:
			if not board_minutes_attached(self.get("board_minutes")):
				frappe.throw(
					_("Attach Board Minutes before submitting an in-scope ESR filing."),
					title=_("Board Minutes Required"),
				)
			for row in self.activities or []:
				if not activity_substance_complete(
					row.employee_count,
					row.operating_expenditure_aed,
					row.substance_evidence,
					row.board_meetings_in_uae,
				):
					frappe.throw(
						_(
							"Row #{0} ({1}): record UAE board meetings, employee count, expenditure, and "
							"substance evidence before submit. Ticking the activity is not enough."
						).format(row.idx, row.activity),
						title=_("Substance Evidence Required"),
					)

	# on_cancel: no extra handling needed -- Frappe moves docstatus to 2.
	# notification_filed_on / report_filed_on are left as history; amend to
	# correct a submitted record.
