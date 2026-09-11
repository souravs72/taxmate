"""Block invoices posted into a submitted VAT 201 period."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae.validation import setting_enabled


def submitted_filing_for(company: str, posting_date) -> str | None:
	"""Return the submitted VAT 201 Filing Log covering ``posting_date``, if any."""
	if not company or not posting_date:
		return None
	if not frappe.db.exists("DocType", "UAE VAT 201 Filing Log"):
		return None
	return frappe.db.get_value(
		"UAE VAT 201 Filing Log",
		{
			"company": company,
			"docstatus": 1,
			"period_start": ["<=", posting_date],
			"period_end": [">=", posting_date],
		},
		"name",
	)


def validate_period_lock(doc, posting_date=None) -> None:
	"""Throw when posting into a filed VAT 201 period (TaxMate Settings)."""
	if not setting_enabled("block_invoices_in_filed_vat_period", default=1):
		return
	company = doc.get("company")
	if not company:
		return
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		return
	date = posting_date if posting_date is not None else doc.get("posting_date")
	filing = submitted_filing_for(company, date)
	if not filing:
		return
	frappe.throw(
		_(
			"{0} {1} is dated in VAT 201 period {2}, which is already submitted. "
			"Cancel and amend that filing before posting into a locked period."
		).format(doc.doctype, doc.name or _("(new)"), filing),
		title=_("VAT 201 Period Locked"),
	)
