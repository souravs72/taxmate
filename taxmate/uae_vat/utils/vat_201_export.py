"""Accountant pack for a VAT 201 Filing Log (CSV + print; no EmaraTax API)."""

from __future__ import annotations

import csv
import io

import frappe
from frappe import _
from frappe.utils import get_url_to_form, now_datetime
from frappe.utils.file_manager import save_file

from taxmate.uae_vat.utils.vat_201 import list_period_customs, list_period_invoices

EMARATAX_API_NOTE = (
	"As of 2026-09 the FTA has not published a public EmaraTax VAT 201 filing API. "
	"This pack is for portal typing and audit backup. TaxMate does not submit the return."
)


def export_accountant_pack(doc) -> dict:
	"""Attach box CSV + invoice listing CSV to the filing log."""
	doc.check_permission("write")
	if not doc.boxes:
		frappe.throw(_("Generate the VAT 201 boxes before exporting the accountant pack."))

	stamp = now_datetime().strftime("%Y%m%d%H%M%S")
	box_name = f"VAT201-boxes-{doc.name}-{stamp}.csv"
	inv_name = f"VAT201-invoices-{doc.name}-{stamp}.csv"
	customs_name = f"VAT201-customs-{doc.name}-{stamp}.csv"

	save_file(box_name, _boxes_csv(doc), doc.doctype, doc.name, is_private=1)
	save_file(inv_name, _invoices_csv(doc), doc.doctype, doc.name, is_private=1)
	save_file(customs_name, _customs_csv(doc), doc.doctype, doc.name, is_private=1)
	pdf_attached = _attach_worksheet_pdf(doc, stamp)

	parts = [_("Accountant pack attached: boxes CSV, invoice listing, and customs listing.")]
	if pdf_attached:
		parts.append(_("VAT 201 worksheet PDF attached."))
	else:
		parts.append(_("Print this log with UAE VAT 201 Worksheet for the PDF worksheet."))

	return {
		"message": " ".join(parts),
		"emaratax_api": EMARATAX_API_NOTE,
		"form_url": get_url_to_form(doc.doctype, doc.name),
		"pdf_attached": pdf_attached,
	}


def _attach_worksheet_pdf(doc, stamp: str) -> bool:
	if not frappe.db.exists("Print Format", "UAE VAT 201 Worksheet"):
		return False
	try:
		pdf = frappe.get_print(
			doc.doctype, doc.name, print_format="UAE VAT 201 Worksheet", as_pdf=True
		)
	except Exception:
		frappe.log_error(title="VAT 201 worksheet PDF failed")
		return False
	save_file(f"VAT201-worksheet-{doc.name}-{stamp}.pdf", pdf, doc.doctype, doc.name, is_private=1)
	return True


def _boxes_csv(doc) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(["Company", doc.company])
	writer.writerow(["TRN", doc.get("company_trn") or ""])
	writer.writerow(["Period Start", doc.period_start])
	writer.writerow(["Period End", doc.period_end])
	writer.writerow(["Due Date", doc.filing_due_date])
	writer.writerow([])
	writer.writerow(["Box", "Legend", "Amount (AED)", "VAT Amount (AED)"])
	for row in doc.boxes:
		writer.writerow([row.box_no, row.legend, row.amount, row.vat_amount])
	writer.writerow([])
	writer.writerow(["Note", EMARATAX_API_NOTE])
	return buf.getvalue()


def _invoices_csv(doc) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(
		[
			"Doctype",
			"Name",
			"Posting Date",
			"Party",
			"Emirate",
			"Net (AED)",
			"UAE VAT (AED)",
			"Box 9 Recoverable",
			"Is Return",
		]
	)
	for row in list_period_invoices(doc.company, doc.period_start, doc.period_end):
		writer.writerow(
			[
				row.get("doctype"),
				row.get("name"),
				row.get("posting_date"),
				row.get("party"),
				row.get("vat_emirate") or "",
				row.get("base_net_total") or 0,
				row.get("uae_vat_amount") or 0,
				row.get("recoverable_standard_rated_expenses") or "",
				row.get("is_return") or 0,
			]
		)
	return buf.getvalue()


def _customs_csv(doc) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(
		["Name", "Declaration Date", "Declaration Number", "Box", "Taxable (AED)", "Import VAT (AED)"]
	)
	for row in list_period_customs(doc.company, doc.period_start, doc.period_end):
		writer.writerow(
			[
				row.get("name"),
				row.get("posting_date"),
				row.get("declaration_number"),
				"7" if row.get("is_adjustment") else "6",
				row.get("taxable_amount") or 0,
				row.get("vat_amount") or 0,
			]
		)
	return buf.getvalue()
