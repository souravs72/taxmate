"""Bootstrap UAE Compliance fixtures: Settings defaults + one UBO Register per UAE company."""

from __future__ import annotations

import frappe

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_compliance.constants import LICENCE_AUTHORITIES


def ensure_compliance_settings_defaults() -> None:
	if not frappe.db.exists("DocType", "UAE Compliance Settings"):
		return
	settings = frappe.get_single("UAE Compliance Settings")
	changed = False
	if not settings.ubo_change_report_deadline_days:
		settings.ubo_change_report_deadline_days = 15
		changed = True
	if settings.enable_ubo_reminders is None:
		settings.enable_ubo_reminders = 1
		changed = True
	if not settings.ubo_reminder_days_before_deadline:
		settings.ubo_reminder_days_before_deadline = 3
		changed = True
	if not settings.esr_notification_deadline_months:
		settings.esr_notification_deadline_months = 6
		changed = True
	if not settings.esr_report_deadline_months:
		settings.esr_report_deadline_months = 12
		changed = True
	if settings.enable_esr_reminders is None:
		settings.enable_esr_reminders = 1
		changed = True
	if not settings.esr_reminder_window_days:
		settings.esr_reminder_window_days = 30
		changed = True
	if hasattr(settings, "licence_authorities") and not settings.licence_authorities:
		for authority in LICENCE_AUTHORITIES:
			if authority == "Other":
				continue
			settings.append(
				"licence_authorities",
				{
					"authority": authority,
					"ubo_change_report_deadline_days": 15,
					"esr_notification_deadline_months": 6,
					"esr_report_deadline_months": 12,
				},
			)
		changed = True
	if changed:
		settings.flags.ignore_permissions = True
		settings.save()


def ensure_company_ubo_register(company: str) -> None:
	"""Create an empty UAE UBO Register for a UAE company if one doesn't exist yet.

	Idempotent -- safe to call on every install/migrate and from Company
	``after_insert``, mirroring ``taxmate.uae.setup.ensure_company_uae_ready``.
	"""
	if not company or frappe.db.exists("UAE UBO Register", company):
		return
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		return

	doc = frappe.get_doc({"doctype": "UAE UBO Register", "company": company})
	doc.insert(ignore_permissions=True)


def ensure_company_shareholder_register(company: str) -> None:
	"""Create an empty legal-ownership register (Cabinet Decision 109), distinct from UBO."""
	if not company or not frappe.db.exists("DocType", "UAE Shareholder Register"):
		return
	if frappe.db.exists("UAE Shareholder Register", company):
		return
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		return

	frappe.get_doc({"doctype": "UAE Shareholder Register", "company": company}).insert(
		ignore_permissions=True
	)


def bootstrap_existing_uae_companies() -> None:
	companies = frappe.get_all("Company", filters={"country": UAE_COUNTRY}, pluck="name")
	for company in companies:
		try:
			ensure_company_ubo_register(company)
			ensure_company_shareholder_register(company)
		except Exception:
			frappe.log_error(
				title=f"TaxMate UAE Compliance bootstrap failed for {company}",
				message=frappe.get_traceback(),
			)
