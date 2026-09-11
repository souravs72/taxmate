# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, today

from taxmate.uae_compliance.utils.deadlines import (
	ubo_change_reporting_deadline,
	ubo_change_status,
	ubo_register_status,
)


def get_compliance_settings():
	return frappe.get_single("UAE Compliance Settings")


class UAEUBORegister(Document):
	def validate(self):
		self._validate_owner_rows()
		self._recompute_change_log()
		self.status = ubo_register_status([row.status for row in self.change_log])

	def _validate_owner_rows(self):
		for row in self.beneficial_owners:
			if not row.is_active and not row.ceased_to_be_ubo_on:
				frappe.throw(
					_("Row #{0}: set 'Ceased to be UBO On' for {1}, who is marked as no longer an active UBO.").format(
						row.idx, row.full_name
					)
				)
			if row.is_active and row.ceased_to_be_ubo_on:
				frappe.throw(
					_("Row #{0}: {1} has a 'Ceased to be UBO On' date but is still marked active.").format(
						row.idx, row.full_name
					)
				)

	def _recompute_change_log(self):
		settings = get_compliance_settings()
		deadline_days = settings.ubo_change_report_deadline_days or 15
		current_date = getdate(today())

		for row in self.change_log:
			change_date = getdate(row.change_date)
			reported_on = getdate(row.reported_to_authority_on) if row.reported_to_authority_on else None
			row.reporting_deadline = ubo_change_reporting_deadline(change_date, deadline_days)
			row.status = ubo_change_status(change_date, reported_on, deadline_days, current_date)

	@frappe.whitelist()
	def log_change(self, change_type: str, change_date, description: str = ""):
		"""Append a change-log row (called from the form's 'Log a Change' button)."""
		self.check_permission("write")
		self.append(
			"change_log",
			{
				"change_type": change_type,
				"change_date": change_date,
				"description": description,
			},
		)
		self.save()
		return self.name
