"""Flick ASP adapter.

Endpoint layout follows the Flick reference integration:
- POST v1/oauth/token                                  (client credentials)
- GET  v1/auth/verify
- GET  v1/participants/{participant_id}
- GET  v1/peppol/lookup/{peppol_id}                    (directory lookup)
- POST v1/{participant_id}/documents                   (submit e-invoice)
- GET  v1/{participant_id}/documents/{document_id}     (status)
- GET  v1/{participant_id}/documents/{document_id}/xml (signed UBL XML)
- GET  v1/{participant_id}/documents/{document_id}/pdf (rendered PDF)
- POST v1/webhooks/subscriptions                       (status callbacks)

Flick accepts a flat document schema (``document_identifier`` /
``receiving_party`` / ``invoice_lines``), not UBL JSON, so the canonical
PINT-AE payload is translated by :func:`map_to_flick_document` on submit.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.uae_e_invoicing.api_classes.base import BaseAPI
from taxmate.uae_e_invoicing.constants import TRANSACTION_TYPE_FLAGS

WEBHOOK_EVENTS = [
	"invoice.submitted",
	"invoice.validated",
	"invoice.accepted",
	"invoice.rejected",
	"invoice.delivered",
	"invoice.failed",
	# Corner-4: documents received for us over the Peppol network
	"invoice.received",
	"document.received",
]


class FlickAPI(BaseAPI):
	API_NAME = "UAE E-Invoice Flick"
	BASE_PATH = "v1"
	TOKEN_PATH = "oauth/token"
	AUTH_KEY_HEADER = "X-Flick-Auth-Key"

	def setup(self):
		self.participant_id = self.settings.participant_id
		if not self.participant_id:
			frappe.throw(
				_("Set the Participant ID in UAE Tax Settings before using the Flick ASP."),
				title=_("ASP Configuration Missing"),
			)

	# ------------------------------------------------------------------
	# Documents
	# ------------------------------------------------------------------

	def submit_invoice(self, payload: dict[str, Any]) -> dict[str, Any]:
		document = map_to_flick_document(payload)
		response = self.post(f"{self.participant_id}/documents", document) or {}
		return {
			"status": response.get("status") or "Submitted",
			"document_id": response.get("document_id") or response.get("documentId") or response.get("id"),
			"uuid": response.get("uuid") or payload.get("UUID"),
			"raw": response,
		}

	def get_document_status(self, document_id: str) -> dict[str, Any]:
		return self.get(f"{self.participant_id}/documents/{document_id}") or {}

	def get_document_xml(self, document_id: str) -> bytes:
		return self.get_binary(f"{self.participant_id}/documents/{document_id}/xml")

	def get_document_pdf(self, document_id: str) -> bytes:
		return self.get_binary(f"{self.participant_id}/documents/{document_id}/pdf")

	# ------------------------------------------------------------------
	# Participant / webhooks
	# ------------------------------------------------------------------

	def verify_auth(self) -> dict[str, Any]:
		return self.get("auth/verify") or {}

	def get_participant_details(self) -> dict[str, Any]:
		return self.get(f"participants/{self.participant_id}") or {}

	def update_participant(self, payload: dict[str, Any]) -> dict[str, Any]:
		return self.put(f"participants/{self.participant_id}", payload) or {}

	def lookup_participant(self, peppol_id: str) -> dict[str, Any]:
		"""Peppol directory lookup — verify a party is registered for exchange."""
		return self.get(f"peppol/lookup/{peppol_id}") or {}

	def register_webhook(self, callback_url: str, secret: str) -> dict[str, Any]:
		payload = {
			"url": callback_url,
			"secret": secret,
			"events": WEBHOOK_EVENTS,
		}
		return self.post("webhooks/subscriptions", payload) or {}

	def get_webhook_subscription(self, subscription_id: str) -> dict[str, Any]:
		return self.get(f"webhooks/subscriptions/{subscription_id}") or {}

	def get_webhook_deliveries(self, subscription_id: str) -> dict[str, Any]:
		return self.get(f"webhooks/subscriptions/{subscription_id}/deliveries") or {}


# ----------------------------------------------------------------------
# PINT-AE -> Flick document schema
# ----------------------------------------------------------------------


def map_to_flick_document(payload: dict[str, Any]) -> dict[str, Any]:
	"""Translate the canonical PINT-AE payload to Flick's flat document schema."""
	currency = payload["DocumentCurrencyCode"]
	document: dict[str, Any] = {
		"document_identifier": payload["ID"],
		"uuid": payload.get("UUID"),
		"issue_date": payload["IssueDate"],
		"document_type": payload["InvoiceTypeCode"],
		"document_currency": currency,
		"buyer_reference": payload.get("BuyerReference"),
		"receiving_party": _party(
			payload["AccountingCustomerParty"]["Party"], payload.get("FZBeneficiaryID")
		),
		"invoice_lines": [_line(line) for line in payload.get("InvoiceLine") or []],
		"legal_monetary_total": _monetary_total(payload["LegalMonetaryTotal"], currency),
		"metadata": _transaction_metadata(payload.get("InvoiceTransactionTypeCode")),
	}

	if payload.get("IssueTime"):
		document["issue_time"] = payload["IssueTime"]
	if payload.get("DueDate"):
		document["due_date"] = payload["DueDate"]
	if payload.get("TaxPointDate"):
		document["tax_point_date"] = payload["TaxPointDate"]

	notes = payload.get("Note")
	if notes:
		notes = notes if isinstance(notes, list) else [notes]
		document["note"] = "\n".join(notes)
		if payload["InvoiceTypeCode"] in ("381", "81", "361"):
			# The credit-note reason is appended last by the payload builder
			document["credit_note_reason"] = notes[-1]

	exchange_rate = (payload.get("TaxExchangeRate") or {}).get("CalculationRate")
	if exchange_rate:
		document["currency_exchange_rate"] = exchange_rate

	period = payload.get("InvoicePeriod")
	if period:
		document["invoice_period"] = {
			"start_date": period.get("StartDate"),
			"end_date": period.get("EndDate"),
			"description_code": period.get("DescriptionCode"),
		}

	reference = (payload.get("BillingReference") or {}).get("InvoiceDocumentReference")
	if reference:
		document["document_references"] = [
			{"id": reference["ID"], "issue_date": reference.get("IssueDate") or ""}
		]

	payment_means = [_payment_means(entry) for entry in payload.get("PaymentMeans") or []]
	if payment_means:
		document["payment_means"] = payment_means

	return _prune(document)


def _party(party: dict[str, Any], fz_beneficiary_id: str | None) -> dict[str, Any]:
	address = party.get("PostalAddress") or {}
	contact = party.get("Contact") or {}
	legal_entity = party.get("PartyLegalEntity") or {}
	name = (party.get("PartyName") or {}).get("Name")

	result = {
		"trade_name": name,
		"legal_name": legal_entity.get("RegistrationName") or name,
		"peppol_id": (party.get("EndpointID") or {}).get("value"),
		"street_address": address.get("StreetName"),
		"additional_street_address": address.get("AdditionalStreetName"),
		"city_address": address.get("CityName"),
		"postal_zone": address.get("PostalZone"),
		"emirates_code": address.get("CountrySubentityCode"),
		"country_code": (address.get("Country") or {}).get("IdentificationCode"),
		"vat_number": (party.get("PartyTaxScheme") or {}).get("CompanyID"),
		"contact_name": contact.get("Name") or name,
		"contact_telephone": contact.get("Telephone"),
		"contact_email": contact.get("ElectronicMail"),
		"fz_beneficiary_id": fz_beneficiary_id,
	}

	legal_id = legal_entity.get("CompanyID")
	if legal_id:
		result["identifiers"] = [{"type": "TL", "value": legal_id.get("value")}]

	return _prune(result)


def _line(line: dict[str, Any]) -> dict[str, Any]:
	item = line.get("Item") or {}
	category = item.get("ClassifiedTaxCategory") or {}
	quantity = line.get("InvoicedQuantity") or {}
	hs_code, sac_code = _classification_codes(item.get("CommodityClassification"))

	result = {
		"id": line.get("ID"),
		"invoiced_quantity": str(quantity.get("value", "")),
		"uom": quantity.get("unitCode"),
		"line_extension_amount": (line.get("LineExtensionAmount") or {}).get("value"),
		"name": item.get("Name"),
		"description": item.get("Description") or item.get("Name"),
		"hs_code": hs_code,
		"sac_code": sac_code,
		"vat_category": category.get("ID"),
		"vat_percentage": category.get("Percent"),
		"unit_price": ((line.get("Price") or {}).get("PriceAmount") or {}).get("value"),
		"base_quantity": "1",
		"vat_exemption_reason_code": category.get("TaxExemptionReason"),
		"rcm_nature_code": category.get("RCMNature"),
	}
	return _prune(result)


def _classification_codes(classification) -> tuple[str | None, str | None]:
	hs_code = sac_code = None
	entries = classification if isinstance(classification, list) else [classification]
	for entry in entries:
		code = (entry or {}).get("ItemClassificationCode") or {}
		if code.get("listID") == "HS":
			hs_code = code.get("value")
		elif code.get("listID") == "SAC":
			sac_code = code.get("value")
	return hs_code, sac_code


def _monetary_total(total: dict[str, Any], currency: str) -> dict[str, Any]:
	def value(key):
		return (total.get(key) or {}).get("value")

	return _prune(
		{
			"line_extension_amount": value("LineExtensionAmount"),
			"tax_exclusive_amount": value("TaxExclusiveAmount"),
			"tax_inclusive_amount": value("TaxInclusiveAmount"),
			"allowance_total_amount": value("AllowanceTotalAmount"),
			"charge_total_amount": value("ChargeTotalAmount"),
			"prepaid_amount": value("PrepaidAmount"),
			"payable_rounding_amount": value("PayableRoundingAmount"),
			"payable_amount": value("PayableAmount"),
			"currency_id": currency,
		}
	)


def _payment_means(entry: dict[str, Any]) -> dict[str, Any]:
	code = entry.get("PaymentMeansCode") or {}
	result: dict[str, Any] = {
		"payment_means_code": code.get("value"),
		"payment_means_code_name": code.get("name"),
	}

	account = entry.get("PayeeFinancialAccount")
	if account:
		account_id = account.get("ID") or {}
		result["payee_financial_account"] = _prune(
			{
				"id": account_id.get("value"),
				"id_scheme_id": account_id.get("schemeID"),
				"name": account.get("Name"),
				"financial_institution_branch": {
					"id": (account.get("FinancialInstitutionBranch") or {}).get("ID") or ""
				},
			}
		)

	card = entry.get("CardAccount")
	if card:
		result["card_account"] = _prune({"holder_name": card.get("HolderName")})

	return _prune(result)


def _transaction_metadata(transaction_type_code: str | None) -> dict[str, bool]:
	"""BTAE-02 bit flags in Flick's metadata naming (is_ftz, is_deemed, ...)."""
	code = (transaction_type_code or "").ljust(8, "0")
	names = {
		"free_trade_zone": "is_ftz",
		"deemed_supply": "is_deemed",
		"margin_scheme": "is_margin",
		"summary_invoice": "is_summary",
		"continuous_supply": "is_continuous",
		"disclosed_agent_billing": "is_dab",
		"e_commerce": "is_ecommerce",
		"export": "is_export",
	}
	return {names[flag]: code[position] == "1" for position, flag in enumerate(TRANSACTION_TYPE_FLAGS)}


def _prune(data: dict[str, Any]) -> dict[str, Any]:
	return {key: value for key, value in data.items() if value is not None}
