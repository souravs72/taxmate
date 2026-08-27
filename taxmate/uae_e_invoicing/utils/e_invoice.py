"""UAE e-invoice orchestration: generate, submit to ASP, track status."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.utils import now_datetime
from frappe.utils.file_manager import save_file

from taxmate.uae_e_invoicing.utils.pint_ae import build_pint_ae_payload, payload_to_json

# ASP status strings (lowercased) -> TaxMate status
ASP_STATUS_MAP = {
	"submitted": "Submitted",
	"validated": "Submitted",
	"accepted": "Accepted",
	"delivered": "Accepted",
	"rejected": "Rejected",
	"failed": "Failed",
}


def get_api():
	"""Instantiate the ASP adapter selected in UAE Tax Settings."""
	provider = frappe.db.get_single_value("UAE Tax Settings", "asp_provider") or "Sandbox"
	if provider == "Flick":
		from taxmate.uae_e_invoicing.api_classes.flick import FlickAPI

		return FlickAPI()

	from taxmate.uae_e_invoicing.api_classes.sandbox import SandboxAPI

	return SandboxAPI()


def is_e_invoice_applicable(doc) -> bool:
	if doc.doctype not in ("Sales Invoice", "Purchase Invoice"):
		return False
	if not frappe.db.has_column("Company", "uae_e_invoice_enabled"):
		return False
	if not frappe.db.get_value("Company", doc.company, "uae_e_invoice_enabled"):
		return False
	if doc.doctype == "Purchase Invoice" and not doc.get("uae_submit_to_fta"):
		return False
	return True


@frappe.whitelist()
def generate_e_invoice(docname: str, doctype: str = "Sales Invoice", throw: bool = True):
	"""Generate the PINT-AE payload, submit to the ASP, and log the result."""
	doc = frappe.get_doc(doctype, docname)
	doc.check_permission("submit")

	if not is_e_invoice_applicable(doc):
		msg = _("UAE e-invoicing is not enabled for company {0}.").format(doc.company)
		if throw:
			frappe.throw(msg)
		frappe.msgprint(msg)
		return None

	if doc.docstatus != 1:
		frappe.throw(_("{0} must be submitted before generating an e-invoice.").format(doctype))

	if doc.get("uae_e_invoice_status") in ("Queued", "Generated", "Submitted", "Accepted"):
		frappe.throw(_("E-invoice already submitted for {0}.").format(doc.name))

	return generate_and_submit(doc)


def generate_and_submit(doc) -> str:
	"""Build payload, create/update the log, submit to the ASP."""
	from frappe.utils.synchronization import filelock

	# Serialize first UUID assignment per invoice (concurrent submit race)
	lock_name = f"uae_e_invoice_submit_{doc.doctype}_{doc.name}"
	with filelock(lock_name, timeout=60):
		reuse_uuid = _existing_log_uuid(doc)

		if doc.doctype == "Purchase Invoice":
			from taxmate.uae_e_invoicing.utils.purchase_transaction_data import (
				build_purchase_pint_ae_payload,
			)

			doc_uuid, payload = build_purchase_pint_ae_payload(doc, doc_uuid=reuse_uuid)
		else:
			doc_uuid, payload = build_pint_ae_payload(doc, doc_uuid=reuse_uuid)

		payload_json = payload_to_json(payload)
		log = _get_or_create_log(doc, doc_uuid, payload_json)

	_replace_attachment(
		("UAE E-Invoice Log", log.name),
		f"{doc.name}-uae-e-invoice.json",
		payload_json.encode("utf-8"),
	)

	try:
		api = get_api()
		result = api.submit_invoice(payload)
	except Exception as e:
		frappe.log_error(
			title=f"UAE e-invoice submission failed for {doc.name}",
			message=frappe.get_traceback(),
		)
		log.db_set(
			{
				"status": "Failed",
				"error_message": str(e)[:500],
			},
			update_modified=False,
		)
		_set_invoice_status(doc, "Failed", log.name)
		return log.name

	status = ASP_STATUS_MAP.get(str(result.get("status", "")).lower(), "Submitted")
	log.db_set(
		{
			"status": status,
			"asp_document_id": result.get("document_id"),
			"submitted_on": now_datetime(),
			"error_message": None,
			"response_json": frappe.as_json(result.get("raw") or result),
		},
		update_modified=False,
	)
	_set_invoice_status(doc, status, log.name)

	if status == "Accepted" and result.get("document_id"):
		_enqueue_fetch_documents(log.name)

	return log.name


@frappe.whitelist()
def sync_status_from_asp(log_name: str) -> str | None:
	"""Poll ASP for current status and apply locally.

	Returns the mapped TaxMate status string, or None if poll/mapping failed.
	"""
	log = frappe.get_doc("UAE E-Invoice Log", log_name)
	# Scheduler runs as Administrator; Desk calls need read on the log
	if frappe.session.user != "Administrator":
		log.check_permission("read")
	if not log.asp_document_id:
		return None

	api = get_api()
	try:
		result = api.get_document_status(log.asp_document_id) or {}
	except Exception:
		frappe.log_error(
			title=f"UAE e-invoice status poll failed for {log.reference_name}",
			message=frappe.get_traceback(),
		)
		return None

	asp_status = (
		result.get("status")
		or result.get("document_status")
		or result.get("documentStatus")
		or ""
	)
	mapped = ASP_STATUS_MAP.get(str(asp_status).lower())
	if not mapped:
		return None

	apply_status_update(log.asp_document_id, asp_status, response=result)
	return mapped



def apply_status_update(
	asp_document_id: str, asp_status: str, response: dict | None = None
) -> str | None:
	"""Update log + invoice from an ASP status event (webhook / polling)."""
	log_name = frappe.db.get_value(
		"UAE E-Invoice Log", {"asp_document_id": asp_document_id}, "name"
	)
	if not log_name:
		return None

	status = ASP_STATUS_MAP.get(str(asp_status).lower())
	if not status:
		return None

	log = frappe.get_doc("UAE E-Invoice Log", log_name)

	# Do not weaken a terminal Accepted status via webhook replay
	if log.status == "Accepted" and status in ("Rejected", "Failed", "Submitted", "Queued"):
		return log_name

	updates = {"status": status}
	if response:
		updates["response_json"] = frappe.as_json(response)
	log.db_set(updates, update_modified=False)

	if frappe.db.exists(log.reference_doctype, log.reference_name):
		frappe.db.set_value(
			log.reference_doctype,
			log.reference_name,
			"uae_e_invoice_status",
			status,
			update_modified=False,
		)

	if status == "Accepted":
		_enqueue_fetch_documents(log_name)

	return log_name


@frappe.whitelist()
def fetch_asp_documents(log_name: str):
	"""Fetch signed XML + PDF from the ASP and attach to the invoice."""
	log = frappe.get_doc("UAE E-Invoice Log", log_name)
	if frappe.session.user == "Guest":
		frappe.only_for("System Manager")
	log.check_permission("read")
	if not log.asp_document_id:
		return

	api = get_api()
	reference = (log.reference_doctype, log.reference_name)

	try:
		xml_content = api.get_document_xml(log.asp_document_id)
		if xml_content:
			_replace_attachment(reference, f"{log.reference_name}-uae-e-invoice.xml", xml_content)

		pdf_content = api.get_document_pdf(log.asp_document_id)
		if pdf_content:
			_replace_attachment(reference, f"{log.reference_name}-uae-e-invoice.pdf", pdf_content)
	except Exception:
		frappe.log_error(
			title=f"UAE e-invoice document fetch failed for {log.name}",
			message=frappe.get_traceback(),
		)


@frappe.whitelist()
def bulk_generate_e_invoices(docnames, doctype: str = "Sales Invoice"):
	"""Submit e-invoices for multiple invoices from the list view."""
	if isinstance(docnames, str):
		docnames = frappe.parse_json(docnames)

	submitted, skipped, failed = [], [], []
	for docname in docnames:
		doc = frappe.get_doc(doctype, docname)
		if not frappe.has_permission(doctype, "submit", doc):
			skipped.append(docname)
			continue
		if (
			doc.docstatus != 1
			or not is_e_invoice_applicable(doc)
			or doc.get("uae_e_invoice_status") in ("Submitted", "Accepted", "Queued", "Generated")
		):
			skipped.append(docname)
			continue
		try:
			generate_and_submit(doc)
			submitted.append(docname)
		except Exception:
			failed.append(docname)
			frappe.log_error(
				title=f"UAE e-invoice bulk submit failed for {docname}",
				message=frappe.get_traceback(),
			)

	return {"submitted": submitted, "skipped": skipped, "failed": failed}


def enqueue_generate(docname: str, doctype: str = "Sales Invoice"):
	frappe.enqueue(
		"taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice",
		queue="short",
		docname=docname,
		doctype=doctype,
		throw=False,
	)


# ----------------------------------------------------------------------
# Internal helpers
# ----------------------------------------------------------------------


def _existing_log_uuid(doc) -> str | None:
	"""Reuse the fiscal UUID from an existing log on retry."""
	log_name = doc.get("uae_e_invoice_log")
	if not log_name:
		log_name = frappe.db.get_value(
			"UAE E-Invoice Log",
			{"reference_doctype": doc.doctype, "reference_name": doc.name},
			"name",
		)
	if not log_name:
		return None
	return frappe.db.get_value("UAE E-Invoice Log", log_name, "uuid")


def _get_or_create_log(doc, doc_uuid: str, payload_json: str):
	existing = doc.get("uae_e_invoice_log")
	if not existing:
		existing = frappe.db.get_value(
			"UAE E-Invoice Log",
			{"reference_doctype": doc.doctype, "reference_name": doc.name},
			"name",
		)
	if existing and frappe.db.exists("UAE E-Invoice Log", existing):
		log = frappe.get_doc("UAE E-Invoice Log", existing)
		updates = {"payload": payload_json, "status": "Generated"}
		# Never overwrite an existing fiscal UUID (ASP idempotency)
		if not log.uuid and doc_uuid:
			updates["uuid"] = doc_uuid
		log.db_set(updates, update_modified=False)
		return log

	log = frappe.get_doc(
		{
			"doctype": "UAE E-Invoice Log",
			"company": doc.company,
			"reference_doctype": doc.doctype,
			"reference_name": doc.name,
			"uuid": doc_uuid,
			"status": "Generated",
			"document_type_code": doc.get("uae_document_type_code") or "",
			"payload": payload_json,
		}
	)
	log.insert(ignore_permissions=True)
	return log


def _set_invoice_status(doc, status: str, log_name: str):
	frappe.db.set_value(
		doc.doctype,
		doc.name,
		{
			"uae_e_invoice_status": status,
			"uae_e_invoice_log": log_name,
		},
		update_modified=False,
	)


def _enqueue_fetch_documents(log_name: str):
	frappe.enqueue(
		"taxmate.uae_e_invoicing.utils.e_invoice.fetch_asp_documents",
		queue="short",
		user="Administrator",
		log_name=log_name,
	)


def _replace_attachment(reference: tuple[str, str], file_name: str, content: bytes):
	doctype, name = reference
	stale = frappe.get_all(
		"File",
		filters={
			"attached_to_doctype": doctype,
			"attached_to_name": name,
			"file_name": file_name,
		},
		pluck="name",
	)
	for file_name_to_delete in stale:
		frappe.delete_doc("File", file_name_to_delete, force=1, ignore_permissions=True)

	save_file(file_name, content, doctype, name, is_private=1)
