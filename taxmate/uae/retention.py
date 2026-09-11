"""FTA record-keeping: do not hard-delete submitted or cancelled filings (5+ years)."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import cint

SUBMITTED_RETAINED_DOCTYPES = (
	"UAE VAT 201 Filing Log",
	"UAE CT Filing Log",
	"UAE ESR Filing",
	"UAE Excise Filing Log",
	"UAE Customs Declaration",
	"UAE Bad Debt Relief",
	"UAE Capital Goods Adjustment",
	"UAE VAT Group",
	"UAE FTA Audit Pack",
)


def on_trash(doc, method=None):
	"""Hook: block delete of a submitted or cancelled statutory record."""
	if doc.doctype not in SUBMITTED_RETAINED_DOCTYPES:
		return
	if cint(doc.docstatus) == 0:
		return
	from taxmate.uae_e_invoicing.utils.mandate import get_retention_years

	frappe.throw(
		_(
			"Do not delete {0} {1} after it has been submitted. Keep filed records for at least {2} years. "
			"Cancel and amend if you need a correction — TaxMate does not e-file."
		).format(doc.doctype, doc.name, get_retention_years()),
		title=_("Statutory Retention"),
	)
