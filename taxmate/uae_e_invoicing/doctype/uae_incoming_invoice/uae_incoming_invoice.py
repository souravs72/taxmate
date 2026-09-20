"""Corner-4 receiving: incoming e-invoices delivered by the ASP.

Stores the received PINT-AE payload and lets accounts users draft a
Purchase Invoice from it after review.
"""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _
from frappe.model.document import Document


class UAEIncomingInvoice(Document):
	pass


def create_from_webhook(payload: dict[str, Any]) -> str | None:
	"""Create an incoming-invoice record from an ASP delivery event."""
	document = payload.get("document") or payload.get("data") or payload
	document_id = (
		payload.get("document_id") or payload.get("documentId") or document.get("UUID") or document.get("ID")
	)
	if not document_id:
		return None

	if frappe.db.exists("UAE Incoming Invoice", {"asp_document_id": document_id}):
		return None

	supplier_party = (document.get("AccountingSupplierParty") or {}).get("Party") or {}
	monetary_total = document.get("LegalMonetaryTotal") or {}

	record = frappe.get_doc(
		{
			"doctype": "UAE Incoming Invoice",
			"company": _resolve_company(document),
			"source": "Webhook",
			"status": "Received",
			"asp_document_id": document_id,
			"issue_date": document.get("IssueDate"),
			"currency": document.get("DocumentCurrencyCode"),
			"supplier_name": (supplier_party.get("PartyName") or {}).get("Name"),
			"supplier_trn": (supplier_party.get("PartyTaxScheme") or {}).get("CompanyID"),
			"total_amount": _amount(monetary_total.get("TaxInclusiveAmount")),
			"tax_amount": _first_tax_amount(document),
			"payload": frappe.as_json(document),
		}
	)
	record.insert(ignore_permissions=True)
	return record.name


@frappe.whitelist()
def create_purchase_invoice(name: str) -> str:
	"""Draft a Purchase Invoice from a received e-invoice."""
	record = frappe.get_doc("UAE Incoming Invoice", name)
	record.check_permission("write")
	return _draft_purchase_invoice(record)


def _draft_purchase_invoice(record, ignore_permissions: bool = False) -> str:
	if not record.company:
		frappe.throw(
			_("Match this inbound invoice to a Company (buyer TRN) before drafting the Purchase Invoice.")
		)

	if record.purchase_invoice:
		frappe.throw(
			_("Purchase Invoice {0} already exists for this document.").format(record.purchase_invoice)
		)

	document = json.loads(record.payload or "{}")
	supplier = _resolve_supplier(record)
	if not supplier:
		frappe.throw(
			_(
				"No Supplier found with TRN {0}. Create the Supplier first, then draft the Purchase Invoice."
			).format(record.supplier_trn or _("(unknown)"))
		)

	invoice = frappe.new_doc("Purchase Invoice")
	invoice.company = record.company
	invoice.supplier = supplier
	invoice.currency = record.currency or "AED"
	invoice.posting_date = record.issue_date
	invoice.bill_no = document.get("ID")
	invoice.bill_date = record.issue_date

	for line in document.get("InvoiceLine") or []:
		item = line.get("Item") or {}
		quantity = line.get("InvoicedQuantity") or {}
		price = (line.get("Price") or {}).get("PriceAmount") or {}
		qty = frappe.utils.flt(quantity.get("value")) or 1
		rate = price.get("value")
		if rate is None:
			rate = _amount(line.get("LineExtensionAmount")) / qty
		invoice.append(
			"items",
			{
				"item_name": item.get("Name") or _("Received Item"),
				"description": item.get("Description") or item.get("Name"),
				"qty": qty,
				"uom": quantity.get("unitCode") or "Nos",
				"rate": rate,
			},
		)

	if not invoice.items:
		frappe.throw(_("The received document has no invoice lines."))

	_append_received_vat(invoice, record)

	invoice.flags.ignore_mandatory = True
	invoice.insert(ignore_permissions=ignore_permissions)

	record.db_set({"status": "Drafted", "purchase_invoice": invoice.name})
	return invoice.name


def _append_received_vat(invoice, record) -> None:
	"""Carry the received VAT as an Actual tax row when a VAT account is mapped."""
	tax_amount = frappe.utils.flt(record.tax_amount)
	if not tax_amount:
		return

	account = frappe.db.get_value(
		"UAE VAT Account",
		{"parent": record.company, "parenttype": "UAE VAT Settings"},
		"account",
	)
	if not account:
		return

	invoice.append(
		"taxes",
		{
			"charge_type": "Actual",
			"account_head": account,
			"description": _("VAT (from received e-invoice)"),
			"tax_amount": tax_amount,
		},
	)


def _auto_draft_enabled() -> bool:
	from taxmate.uae_e_invoicing.utils.mandate import setting_on

	return setting_on("auto_draft_incoming_pi", default=0)


def _party_by_trn(doctype: str, trn: str | None) -> str | None:
	"""Match a Company/Supplier by normalized TRN (spaces ignored)."""
	from taxmate.uae.validation import normalize_trn

	cleaned = normalize_trn(trn)
	if not cleaned:
		return None
	if doctype not in ("Company", "Supplier"):
		return None
	row = frappe.db.sql(
		f"select name from `tab{doctype}` where replace(ifnull(tax_id, ''), ' ', '') = %s limit 1",
		cleaned,
	)
	return row[0][0] if row else None


def _resolve_company(document: dict[str, Any]) -> str | None:
	"""Match the buyer TRN to a local company. Missing or unmatched TRN is not the default company."""
	buyer_party = (document.get("AccountingCustomerParty") or {}).get("Party") or {}
	buyer_trn = (buyer_party.get("PartyTaxScheme") or {}).get("CompanyID")
	return _party_by_trn("Company", buyer_trn)


def _resolve_supplier(record) -> str | None:
	if record.supplier_trn:
		return _party_by_trn("Supplier", record.supplier_trn)
	if record.supplier_name:
		return frappe.db.get_value("Supplier", {"supplier_name": record.supplier_name}, "name")
	return None


def _amount(value) -> float:
	if isinstance(value, dict):
		value = value.get("value")
	return frappe.utils.flt(value)


def _first_tax_amount(document: dict[str, Any]) -> float:
	tax_totals = document.get("TaxTotal")
	if isinstance(tax_totals, list) and tax_totals:
		return _amount(tax_totals[0].get("TaxAmount"))
	if isinstance(tax_totals, dict):
		return _amount(tax_totals.get("TaxAmount"))
	return 0.0
