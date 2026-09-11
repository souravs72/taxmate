"""Late-filing reminders. Status only — TaxMate does not calculate FTA penalties."""

from __future__ import annotations

from datetime import date

from frappe.utils import date_diff, getdate

NOT_LEGAL_ADVICE = (
	"This is a filing-status reminder, not legal advice. TaxMate does not calculate FTA penalties "
	"or interest. File in the official portal; submitting the TaxMate log does not e-file."
)

OBLIGATION_VAT_201 = "VAT 201"
OBLIGATION_CT = "Corporate Tax"
OBLIGATION_ESR_NOTIFICATION = "ESR Notification"
OBLIGATION_ESR_REPORT = "ESR Report"


def days_late(due_date, as_of=None) -> int:
	"""Calendar days after the due date. Zero when due today or still upcoming."""
	due = getdate(due_date)
	as_of_date = getdate(as_of) if as_of else date.today()
	if not isinstance(due, date) or not isinstance(as_of_date, date):
		return 0
	delta = date_diff(as_of_date, due)
	return delta if delta > 0 else 0


def notice_status(due_date, as_of=None, cleared: bool = False) -> str:
	if cleared:
		return "Cleared"
	late = days_late(due_date, as_of)
	if late > 0:
		return "Overdue"
	due = getdate(due_date)
	as_of_date = getdate(as_of) if as_of else date.today()
	if isinstance(due, date) and isinstance(as_of_date, date) and as_of_date == due:
		return "Due"
	return "Upcoming"


def sync_late_filing_notices() -> int:
	"""Upsert notices for Due/Overdue drafts. Daily job. Returns rows touched."""
	import frappe
	from frappe.utils import nowdate

	if not frappe.db.exists("DocType", "UAE Late Filing Notice"):
		return 0
	today = nowdate()
	touched = 0
	touched += _sync_vat_201(today)
	touched += _sync_ct(today)
	touched += _sync_esr(today)
	return touched


def _sync_vat_201(today: str) -> int:
	import frappe

	if not frappe.db.exists("DocType", "UAE VAT 201 Filing Log"):
		return 0
	count = 0
	for log in frappe.get_all(
		"UAE VAT 201 Filing Log",
		filters={"docstatus": ["!=", 2]},
		fields=["name", "company", "filing_due_date", "docstatus", "deadline_status"],
	):
		cleared = int(log.docstatus) == 1
		if not log.filing_due_date:
			continue
		status = notice_status(log.filing_due_date, today, cleared=cleared)
		if status == "Upcoming" and not cleared:
			continue
		if status in ("Due", "Overdue") or (
			cleared and _existing(log.company, "UAE VAT 201 Filing Log", log.name, OBLIGATION_VAT_201)
		):
			_upsert(
				company=log.company,
				source_doctype="UAE VAT 201 Filing Log",
				source_name=log.name,
				obligation=OBLIGATION_VAT_201,
				due_date=log.filing_due_date,
				as_of=today,
				cleared=cleared,
			)
			count += 1
	return count


def _sync_ct(today: str) -> int:
	import frappe

	if not frappe.db.exists("DocType", "UAE CT Filing Log"):
		return 0
	count = 0
	for log in frappe.get_all(
		"UAE CT Filing Log",
		filters={"docstatus": ["!=", 2]},
		fields=["name", "company", "filing_due_date", "docstatus"],
	):
		cleared = int(log.docstatus) == 1
		if not log.filing_due_date:
			continue
		status = notice_status(log.filing_due_date, today, cleared=cleared)
		if status == "Upcoming" and not cleared:
			continue
		if status in ("Due", "Overdue") or (
			cleared and _existing(log.company, "UAE CT Filing Log", log.name, OBLIGATION_CT)
		):
			_upsert(
				company=log.company,
				source_doctype="UAE CT Filing Log",
				source_name=log.name,
				obligation=OBLIGATION_CT,
				due_date=log.filing_due_date,
				as_of=today,
				cleared=cleared,
			)
			count += 1
	return count


def _sync_esr(today: str) -> int:
	import frappe

	if not frappe.db.exists("DocType", "UAE ESR Filing"):
		return 0
	count = 0
	for log in frappe.get_all(
		"UAE ESR Filing",
		filters={"docstatus": ["!=", 2]},
		fields=[
			"name",
			"company",
			"notification_due_date",
			"notification_filed_on",
			"report_due_date",
			"report_filed_on",
		],
	):
		count += _sync_esr_row(
			log, today, OBLIGATION_ESR_NOTIFICATION, log.notification_due_date, log.notification_filed_on
		)
		count += _sync_esr_row(log, today, OBLIGATION_ESR_REPORT, log.report_due_date, log.report_filed_on)
	return count


def _sync_esr_row(log, today, obligation, due_date, filed_on) -> int:
	if not due_date:
		return 0
	cleared = bool(filed_on)
	status = notice_status(due_date, today, cleared=cleared)
	if status == "Upcoming" and not cleared:
		return 0
	if status in ("Due", "Overdue") or (
		cleared and _existing(log.company, "UAE ESR Filing", log.name, obligation)
	):
		_upsert(
			company=log.company,
			source_doctype="UAE ESR Filing",
			source_name=log.name,
			obligation=obligation,
			due_date=due_date,
			as_of=today,
			cleared=cleared,
		)
		return 1
	return 0


def _existing(company, source_doctype, source_name, obligation) -> str | None:
	import frappe

	return frappe.db.get_value(
		"UAE Late Filing Notice",
		{
			"company": company,
			"source_doctype": source_doctype,
			"source_name": source_name,
			"obligation": obligation,
		},
		"name",
	)


def _upsert(company, source_doctype, source_name, obligation, due_date, as_of, cleared: bool) -> None:
	import frappe

	status = notice_status(due_date, as_of, cleared=cleared)
	late = 0 if cleared else days_late(due_date, as_of)
	name = _existing(company, source_doctype, source_name, obligation)
	values = {
		"due_date": due_date,
		"days_late": late,
		"status": status,
		"guidance": NOT_LEGAL_ADVICE,
	}
	if name:
		frappe.db.set_value("UAE Late Filing Notice", name, values, update_modified=False)
		return
	if status not in ("Due", "Overdue"):
		return
	doc = frappe.get_doc(
		{
			"doctype": "UAE Late Filing Notice",
			"company": company,
			"source_doctype": source_doctype,
			"source_name": source_name,
			"obligation": obligation,
			**values,
		}
	)
	doc.flags.ignore_permissions = True
	doc.insert()
