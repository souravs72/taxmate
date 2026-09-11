"""Daily SLA and contingency reminders for UAE e-invoicing."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import get_url_to_form, getdate, nowdate
from frappe.utils.user import get_users_with_role

from taxmate.uae_e_invoicing.utils.mandate import sla_status


def send_e_invoice_reminders() -> None:
	_remind_sla_breaches()
	_remind_contingency()


def _remind_sla_breaches() -> None:
	if not frappe.db.exists("DocType", "UAE E-Invoice Log"):
		return
	from taxmate.uae_e_invoicing.utils.mandate import get_sla_days

	today = nowdate()
	days = get_sla_days()
	log_filters = {
		"status": ["in", ["Queued", "Generated", "Submitted", "Rejected", "Failed"]],
	}
	if frappe.db.has_column("UAE E-Invoice Log", "sla_due"):
		log_filters["sla_due"] = ["<=", today]
	for log in frappe.get_all(
		"UAE E-Invoice Log",
		filters=log_filters,
		fields=["name", "company", "reference_name", "issued_on", "accepted_on", "sla_due"],
	):
		if sla_status(log.issued_on, log.accepted_on, today=today, sla_days=days) != "Breached":
			continue
		_raise_todo_once(
			"UAE E-Invoice Log",
			log.name,
			_("E-invoice {0} for {1} is past the {2}-day transmission SLA (due {3}).").format(
				log.reference_name, log.company, days, log.sla_due
			),
		)


def _remind_contingency() -> None:
	if not frappe.db.exists("DocType", "UAE E-Invoice Contingency"):
		return
	today = getdate(nowdate())
	for row in frappe.get_all(
		"UAE E-Invoice Contingency",
		filters={"status": "Open", "reported_to_fta": 0},
		fields=["name", "company", "report_due"],
	):
		if not row.report_due or getdate(row.report_due) > today:
			continue
		_raise_todo_once(
			"UAE E-Invoice Contingency",
			row.name,
			_("E-invoice downtime for {0} must be reported to the FTA (due {1}).").format(
				row.company, row.report_due
			),
		)


def _raise_todo_once(doctype: str, name: str, description: str) -> None:
	if frappe.db.exists("ToDo", {"reference_type": doctype, "reference_name": name, "status": "Open"}):
		return
	recipients = get_users_with_role("Accounts Manager") or get_users_with_role("System Manager")
	if not recipients:
		return
	frappe.get_doc(
		{
			"doctype": "ToDo",
			"reference_type": doctype,
			"reference_name": name,
			"allocated_to": recipients[0],
			"description": f"{description}\n\n{get_url_to_form(doctype, name)}",
			"priority": "High",
		}
	).insert(ignore_permissions=True)
