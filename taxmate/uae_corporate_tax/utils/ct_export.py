"""Accountant pack for a CT Filing Log (CSV + print; no FTA e-file API)."""

from __future__ import annotations

import csv
import io

import frappe
from frappe import _
from frappe.utils import get_url_to_form, now_datetime
from frappe.utils.file_manager import save_file

from taxmate.uae_corporate_tax.constants import FTA_RETURN_NOTE
from taxmate.uae_corporate_tax.utils.corporate_tax import list_related_party_invoices


def export_accountant_pack(doc) -> dict:
	doc.check_permission("write")
	if not doc.generated_on:
		frappe.throw(_("Generate the Corporate Tax worksheet before exporting the accountant pack."))

	stamp = now_datetime().strftime("%Y%m%d%H%M%S")
	save_file(f"CT-worksheet-{doc.name}-{stamp}.csv", _worksheet_csv(doc), doc.doctype, doc.name, is_private=1)
	save_file(f"CT-adjustments-{doc.name}-{stamp}.csv", _adjustments_csv(doc), doc.doctype, doc.name, is_private=1)
	save_file(
		f"CT-related-parties-{doc.name}-{stamp}.csv",
		_related_party_csv(doc),
		doc.doctype,
		doc.name,
		is_private=1,
	)
	pdf_attached = _attach_worksheet_pdf(doc, stamp)
	parts = [_("Accountant pack attached: worksheet CSV, adjustments, and related-party listing.")]
	if pdf_attached:
		parts.append(_("CT worksheet PDF attached."))
	return {
		"message": " ".join(parts),
		"fta_api": FTA_RETURN_NOTE,
		"form_url": get_url_to_form(doc.doctype, doc.name),
		"pdf_attached": pdf_attached,
	}


def _attach_worksheet_pdf(doc, stamp: str) -> bool:
	if not frappe.db.exists("Print Format", "UAE CT Worksheet"):
		return False
	try:
		pdf = frappe.get_print(doc.doctype, doc.name, print_format="UAE CT Worksheet", as_pdf=True)
	except Exception:
		frappe.log_error(title="CT worksheet PDF failed")
		return False
	save_file(f"CT-worksheet-{doc.name}-{stamp}.pdf", pdf, doc.doctype, doc.name, is_private=1)
	return True


def _worksheet_csv(doc) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(["Company", doc.company])
	writer.writerow(["TRN", doc.get("company_trn") or ""])
	writer.writerow(["Period Start", doc.period_start])
	writer.writerow(["Period End", doc.period_end])
	writer.writerow(["Due Date", doc.filing_due_date])
	writer.writerow(["Regime", doc.regime])
	writer.writerow([])
	writer.writerow(["Line", "Amount (AED)"])
	for label, field in (
		("Revenue", "revenue"),
		("Expenses", "expenses"),
		("Accounting profit", "accounting_profit"),
		("Taxable profit", "taxable_profit"),
		("Tax payable", "tax_payable"),
		("Qualifying revenue", "qualifying_revenue"),
		("Non-qualifying revenue", "non_qualifying_revenue"),
		("Unclassified revenue", "unclassified_revenue"),
		("De minimis limit", "de_minimis_limit"),
	):
		writer.writerow([label, doc.get(field)])
	writer.writerow([])
	writer.writerow(["Note", FTA_RETURN_NOTE])
	return buf.getvalue()


def _adjustments_csv(doc) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(["Type", "Category", "Amount (AED)", "Notes"])
	for row in doc.adjustments or []:
		writer.writerow([row.adjustment_type, row.category, row.amount, row.notes or ""])
	return buf.getvalue()


def _related_party_csv(doc) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(["DocType", "Name", "Date", "Party", "Amount (AED)"])
	for row in list_related_party_invoices(doc.company, doc.period_start, doc.period_end):
		writer.writerow([row.doctype, row.name, row.posting_date, row.party, row.amount])
	writer.writerow([])
	writer.writerow(
		[
			"Note",
			"This is a related-party invoice listing for the documentation pack. TaxMate is not full transfer-pricing software.",
		]
	)
	return buf.getvalue()
