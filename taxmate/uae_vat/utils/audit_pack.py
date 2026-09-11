"""Build a private FTA audit zip (invoices, VAT 201, e-invoice XML, UBO). No portal API."""

from __future__ import annotations

import csv
import io
import zipfile

import frappe
from frappe import _
from frappe.utils import get_url_to_form, now_datetime
from frappe.utils.file_manager import save_file

from taxmate.uae_vat.utils.vat_201 import list_period_invoices

MANIFEST_NOTE = (
	"TaxMate FTA audit pack. This zip is an audit backup for portal filing. "
	"As of 2026-09 there is no public FTA e-file API for VAT 201 / CT / UBO. "
	"Keep records 5+ years. Host files in the UAE when the tenant is UAE-hosted."
)


def export_audit_zip(doc) -> dict:
	"""Attach a private zip to UAE FTA Audit Pack."""
	doc.check_permission("write")
	files = collect_pack_files(doc.company, doc.period_start, doc.period_end)
	buf = io.BytesIO()
	with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
		for name, content in files:
			zf.writestr(name, content)
	stamp = now_datetime().strftime("%Y%m%d%H%M%S")
	file_name = f"FTA-audit-{doc.company}-{doc.period_start}-{stamp}.zip"
	save_file(file_name, buf.getvalue(), doc.doctype, doc.name, is_private=1)
	if doc.meta.has_field("pack_file"):
		doc.db_set("pack_file", file_name, update_modified=False)
	return {
		"message": _("Audit zip attached ({0} files).").format(len(files)),
		"file_name": file_name,
		"files": [name for name, _ in files],
		"fta_api": MANIFEST_NOTE,
		"form_url": get_url_to_form(doc.doctype, doc.name),
	}


def collect_pack_files(company: str, period_start, period_end) -> list[tuple[str, bytes]]:
	"""Return (path, content) pairs. Pure enough to unit-test the names."""
	entries: list[tuple[str, bytes]] = [
		("00-manifest.txt", _manifest(company, period_start, period_end).encode("utf-8")),
		("01-invoices.csv", _invoices_csv(company, period_start, period_end).encode("utf-8")),
		("02-vat201.csv", _vat_201_csv(company, period_start, period_end).encode("utf-8")),
		("03-ubo.csv", _ubo_csv(company).encode("utf-8")),
		("04-residency.txt", _residency_note().encode("utf-8")),
	]
	entries.extend(_e_invoice_xmls(company, period_start, period_end))
	return entries


def _manifest(company, period_start, period_end) -> str:
	return (
		f"Company: {company}\nPeriod: {period_start} to {period_end}\n\n"
		f"{MANIFEST_NOTE}\n"
	)


def _residency_note() -> str:
	note = ""
	if frappe.db.exists("DocType", "TaxMate Settings"):
		note = frappe.db.get_single_value("TaxMate Settings", "data_residency_note") or ""
	if not note and frappe.db.exists("DocType", "UAE Tax Settings"):
		note = frappe.db.get_single_value("UAE Tax Settings", "uae_storage_note") or ""
	if not note:
		note = (
			"Prefer UAE-hosted File storage. Signed XML/PDF stay as private File records on this site. "
			"TaxMate does not move archives off-site."
		)
	prefer = 1
	if frappe.db.exists("DocType", "TaxMate Settings") and frappe.get_meta("TaxMate Settings").has_field(
		"prefer_uae_hosted_files"
	):
		prefer = frappe.db.get_single_value("TaxMate Settings", "prefer_uae_hosted_files")
	return f"Prefer UAE-hosted files: {int(prefer or 0)}\n\n{note}\n"


def _invoices_csv(company, period_start, period_end) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(["Doctype", "Name", "Posting Date", "Party", "Emirate", "Net (AED)", "UAE VAT (AED)", "Is Return"])
	for row in list_period_invoices(company, period_start, period_end):
		writer.writerow(
			[
				row.get("doctype"),
				row.get("name"),
				row.get("posting_date"),
				row.get("party"),
				row.get("vat_emirate") or "",
				row.get("base_net_total") or 0,
				row.get("uae_vat_amount") or 0,
				row.get("is_return") or 0,
			]
		)
	return buf.getvalue()


def _vat_201_csv(company, period_start, period_end) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(["Filing Log", "Box", "Legend", "Amount (AED)", "VAT Amount (AED)"])
	if not frappe.db.exists("DocType", "UAE VAT 201 Filing Log"):
		return buf.getvalue()
	logs = frappe.get_all(
		"UAE VAT 201 Filing Log",
		filters={
			"company": company,
			"docstatus": ["!=", 2],
			"period_start": ["<=", period_end],
			"period_end": [">=", period_start],
		},
		pluck="name",
	)
	for name in logs:
		doc = frappe.get_doc("UAE VAT 201 Filing Log", name)
		for row in doc.get("boxes") or []:
			writer.writerow([name, row.box_no, row.legend, row.amount, row.vat_amount])
	return buf.getvalue()


def _ubo_csv(company) -> str:
	buf = io.StringIO()
	writer = csv.writer(buf)
	writer.writerow(
		["Register", "Full Name", "Person Type", "Control Basis", "Ownership %", "Active", "Became UBO On"]
	)
	if not frappe.db.exists("DocType", "UAE UBO Register"):
		return buf.getvalue()
	register = frappe.db.get_value("UAE UBO Register", {"company": company}, "name")
	if not register:
		return buf.getvalue()
	for row in frappe.get_all(
		"UAE UBO Owner",
		filters={"parent": register, "parenttype": "UAE UBO Register"},
		fields=["full_name", "person_type", "control_basis", "ownership_percentage", "is_active", "became_ubo_on"],
	):
		writer.writerow(
			[
				register,
				row.full_name,
				row.person_type,
				row.control_basis,
				row.ownership_percentage,
				row.is_active,
				row.became_ubo_on,
			]
		)
	return buf.getvalue()


def _e_invoice_xmls(company, period_start, period_end) -> list[tuple[str, bytes]]:
	out: list[tuple[str, bytes]] = []
	if not frappe.db.exists("DocType", "UAE E-Invoice Log"):
		return out
	logs = frappe.get_all(
		"UAE E-Invoice Log",
		filters={
			"company": company,
			"status": ["in", ["Accepted", "Submitted"]],
			"issued_on": ["between", [period_start, period_end]],
		},
		fields=["name", "reference_name"],
	)
	for log in logs:
		files = frappe.get_all(
			"File",
			filters={"attached_to_doctype": "UAE E-Invoice Log", "attached_to_name": log.name},
			fields=["name", "file_name", "is_private"],
		)
		for f in files:
			if not (f.file_name or "").lower().endswith((".xml", ".pdf")):
				continue
			content = _read_file_content(f.name)
			if content:
				safe = f"{log.reference_name or log.name}-{f.file_name}"
				out.append((f"einvoice/{safe}", content))
	return out


def _read_file_content(file_name: str) -> bytes:
	try:
		file_doc = frappe.get_doc("File", file_name)
		data = file_doc.get_content()
		if isinstance(data, str):
			return data.encode("utf-8")
		return data or b""
	except Exception:
		frappe.log_error(title="FTA audit pack: file read failed")
		return b""
