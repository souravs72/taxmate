"""PINT-AE (Peppol UAE billing) payload builder.

Maps the validated transaction model from ``UAETransactionData`` onto a
UBL-2.1-aligned JSON structure covering the PINT-AE mandatory business
terms, including UAE-specific BTAE fields (transaction type code, AED
tax-currency amounts, FZ beneficiary).
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from taxmate.uae_e_invoicing.constants import (
	AED_CURRENCY,
	PINT_AE_CUSTOMIZATION_ID,
	PINT_AE_PROFILE_ID,
)
from taxmate.uae_e_invoicing.utils.transaction_data import UAETransactionData


def build_pint_ae_payload(doc, doc_uuid: str | None = None) -> tuple[str, dict[str, Any]]:
	"""Return (uuid, payload_dict) for a Sales Invoice."""
	data = UAETransactionData(doc).get_data()
	return build_payload_from_data(data, doc_uuid=doc_uuid)


def build_payload_from_data(
	data: dict[str, Any], doc_uuid: str | None = None
) -> tuple[str, dict[str, Any]]:
	"""Map a validated transaction-data dict onto the PINT-AE structure.

	``doc_uuid`` reuses an existing fiscal document UUID on retry so the ASP
	does not treat the resubmission as a new invoice.
	"""
	doc_uuid = doc_uuid or str(uuid.uuid4())

	payload: dict[str, Any] = {
		"CustomizationID": PINT_AE_CUSTOMIZATION_ID,
		"ProfileID": PINT_AE_PROFILE_ID,
		"ID": data["invoice_number"],
		"UUID": doc_uuid,
		"IssueDate": data["issue_date"],
		"InvoiceTypeCode": data["document_type_code"],
		"DocumentCurrencyCode": data["currency"],
		"BuyerReference": data["buyer_reference"],
		# BTAE-02: UAE invoice transaction type bit-flag code
		"InvoiceTransactionTypeCode": data["transaction_type_code"],
		"AccountingSupplierParty": {"Party": _party(data["supplier"])},
		"AccountingCustomerParty": {"Party": _party(data["customer"])},
		"InvoiceLine": [_invoice_line(line, data["currency"]) for line in data["lines"]],
		"TaxTotal": _tax_totals(data),
		"LegalMonetaryTotal": _legal_monetary_total(data),
	}

	if data["issue_time"]:
		payload["IssueTime"] = data["issue_time"]
	if data["due_date"]:
		payload["DueDate"] = data["due_date"]
	if data["currency"] != AED_CURRENCY:
		payload["TaxCurrencyCode"] = data["tax_currency"]
		payload["TaxExchangeRate"] = {
			"SourceCurrencyCode": data["currency"],
			"TargetCurrencyCode": AED_CURRENCY,
			"CalculationRate": data["exchange_rate"],
		}
	if data["payment_means"]:
		payload["PaymentMeans"] = [_payment_means(entry) for entry in data["payment_means"]]

	period = data.get("invoice_period")
	if period and (period.get("start_date") or period.get("end_date")):
		invoice_period: dict[str, Any] = {}
		if period.get("start_date"):
			invoice_period["StartDate"] = period["start_date"]
		if period.get("end_date"):
			invoice_period["EndDate"] = period["end_date"]
		if period.get("description_code"):
			invoice_period["DescriptionCode"] = period["description_code"]
		payload["InvoicePeriod"] = invoice_period

	if data.get("tax_point_date"):
		payload["TaxPointDate"] = data["tax_point_date"]

	doc_allowance = data.get("document_allowance")
	if doc_allowance:
		payload["AllowanceCharge"] = [
			{
				"ChargeIndicator": False,
				"AllowanceChargeReason": doc_allowance["reason"],
				"Amount": {
					"value": doc_allowance["amount"],
					"currencyID": data["currency"],
				},
			}
		]

	# IBT-022: invoice-level notes; the credit-note reason is also carried as a note
	notes = [note for note in (data.get("notes") or []) if note]

	credit_note = data.get("credit_note")
	if credit_note:
		if credit_note.get("reference"):
			document_reference: dict[str, Any] = {"ID": credit_note["reference"]["id"]}
			# IssueDate is unknown for invoices issued outside this system
			if credit_note["reference"].get("issue_date"):
				document_reference["IssueDate"] = credit_note["reference"]["issue_date"]
			payload["BillingReference"] = {"InvoiceDocumentReference": document_reference}
		if credit_note.get("reason"):
			notes.append(credit_note["reason"])

	if notes:
		payload["Note"] = notes[0] if len(notes) == 1 else notes

	fz_beneficiary = data["customer"].get("fz_beneficiary_id")
	if fz_beneficiary:
		# BTAE-01: Free Zone beneficiary identifier
		payload["FZBeneficiaryID"] = fz_beneficiary

	if data.get("vat_emirate"):
		payload["VATEmirate"] = data["vat_emirate"]

	return doc_uuid, payload


def payload_to_json(payload: dict[str, Any]) -> str:
	return json.dumps(payload, indent=2, ensure_ascii=False, default=str)


# ----------------------------------------------------------------------
# Sections
# ----------------------------------------------------------------------


def _party(party: dict[str, Any]) -> dict[str, Any]:
	result: dict[str, Any] = {
		"PartyName": {"Name": party["name"]},
		"PartyLegalEntity": {
			"RegistrationName": party["name"],
		},
	}

	if party.get("peppol_id"):
		result["EndpointID"] = {"schemeID": "0235", "value": party["peppol_id"]}

	legal_id = party.get("legal_registration_identifier") or party.get("trade_license_number")
	if legal_id:
		result["PartyLegalEntity"]["CompanyID"] = {
			"schemeID": party.get("legal_registration_identifier_type") or "OTH",
			"value": legal_id,
		}

	if party.get("trn"):
		result["PartyTaxScheme"] = {
			"CompanyID": party["trn"],
			"TaxScheme": {"ID": "VAT"},
		}

	address = party.get("address")
	if address:
		postal: dict[str, Any] = {
			"StreetName": address.get("line1"),
			"CityName": address.get("city"),
			"Country": {"IdentificationCode": address.get("country_code")},
		}
		if address.get("line2"):
			postal["AdditionalStreetName"] = address["line2"]
		if address.get("postal_zone"):
			postal["PostalZone"] = address["postal_zone"]
		if address.get("emirate_code"):
			postal["CountrySubentityCode"] = address["emirate_code"]
		result["PostalAddress"] = postal

	contact = party.get("contact") or {}
	if any(contact.values()):
		result["Contact"] = {
			key: value
			for key, value in (
				("Name", contact.get("name")),
				("ElectronicMail", contact.get("email")),
				("Telephone", contact.get("phone")),
			)
			if value
		}

	return result


def _payment_means(entry: dict[str, Any]) -> dict[str, Any]:
	result: dict[str, Any] = {
		"PaymentMeansCode": {"value": entry["code"], "name": entry["name"]},
	}
	account = entry.get("payee_financial_account")
	if account:
		result["PayeeFinancialAccount"] = {
			"ID": {"schemeID": account.get("scheme"), "value": account.get("id")},
			"Name": account.get("name"),
		}
		if account.get("branch"):
			result["PayeeFinancialAccount"]["FinancialInstitutionBranch"] = {
				"ID": account["branch"]
			}
	card = entry.get("card_account")
	if card:
		result["CardAccount"] = {"HolderName": card.get("holder_name")}
	return result


def _invoice_line(line: dict[str, Any], currency: str) -> dict[str, Any]:
	from taxmate.uae_e_invoicing.constants import (
		ITEM_TYPE_BOTH,
		ITEM_TYPE_GOODS,
		ITEM_TYPE_SERVICE,
	)

	tax_category: dict[str, Any] = {
		"ID": line["vat_category_code"],
		"Percent": line["tax_rate"],
		"TaxScheme": {"ID": "VAT"},
	}
	if line.get("exemption_reason"):
		tax_category["TaxExemptionReason"] = line["exemption_reason"]
	if line.get("rcm_nature"):
		tax_category["RCMNature"] = line["rcm_nature"]

	result: dict[str, Any] = {
		"ID": line["id"],
		"InvoicedQuantity": {"value": line["qty"], "unitCode": line["uom"]},
		"LineExtensionAmount": {"value": line["net_amount"], "currencyID": currency},
		# BTAE-10: line amount payable in AED
		"LineExtensionAmountAED": line["base_net_amount"],
		"Item": {
			"Name": line["item_name"] or line["item_code"],
			"Description": line["description"],
			"ClassifiedTaxCategory": tax_category,
		},
		"Price": {"PriceAmount": {"value": line["rate"], "currencyID": currency}},
		"TaxTotal": {
			"TaxAmount": {"value": line["tax_amount"], "currencyID": currency},
			# BTAE-08: VAT line amount in AED
			"TaxAmountAED": line["base_tax_amount"],
		},
	}

	classifications = []
	item_type = line.get("uae_item_type")
	if item_type in (ITEM_TYPE_GOODS, ITEM_TYPE_BOTH) and line.get("hs_code"):
		classifications.append(
			{"ItemClassificationCode": {"listID": "HS", "value": line["hs_code"]}}
		)
	if item_type in (ITEM_TYPE_SERVICE, ITEM_TYPE_BOTH) and line.get("sac_code"):
		classifications.append(
			{"ItemClassificationCode": {"listID": "SAC", "value": line["sac_code"]}}
		)
	# Fallback when type is blank but a code is present
	if not classifications:
		if line.get("hs_code"):
			classifications.append(
				{"ItemClassificationCode": {"listID": "HS", "value": line["hs_code"]}}
			)
		elif line.get("sac_code"):
			classifications.append(
				{"ItemClassificationCode": {"listID": "SAC", "value": line["sac_code"]}}
			)

	if len(classifications) == 1:
		result["Item"]["CommodityClassification"] = classifications[0]
	elif len(classifications) > 1:
		result["Item"]["CommodityClassification"] = classifications

	if line.get("discount_amount") and line.get("price_before_discount") is not None:
		# PriceAmount must be the pre-discount unit price when AllowanceCharge is present
		result["Price"] = {
			"PriceAmount": {
				"value": line["price_before_discount"],
				"currencyID": currency,
			}
		}
		result["AllowanceCharge"] = {
			"ChargeIndicator": False,
			"Amount": {"value": abs(float(line["discount_amount"])), "currencyID": currency},
			"AllowanceChargeReason": "Discount",
		}

	return result


def _tax_totals(data: dict[str, Any]) -> list[dict[str, Any]]:
	currency = data["currency"]
	totals = data["totals"]

	subtotals = []
	for entry in data["tax_breakdown"]:
		category: dict[str, Any] = {
			"ID": entry["vat_category_code"],
			"Percent": entry["tax_rate"],
			"TaxScheme": {"ID": "VAT"},
		}
		if entry.get("exemption_reason"):
			category["TaxExemptionReason"] = entry["exemption_reason"]
		if entry.get("rcm_nature"):
			category["RCMNature"] = entry["rcm_nature"]
		subtotals.append(
			{
				"TaxableAmount": {"value": entry["taxable_amount"], "currencyID": currency},
				"TaxAmount": {"value": entry["tax_amount"], "currencyID": currency},
				"TaxCategory": category,
			}
		)

	tax_totals = [
		{
			"TaxAmount": {"value": totals["tax_total_amount"], "currencyID": currency},
			"TaxSubtotal": subtotals,
		}
	]

	# Second TaxTotal in AED (tax accounting currency, IBT-110/111 + BTAE-08)
	if currency != AED_CURRENCY:
		tax_totals.append(
			{
				"TaxAmount": {
					"value": totals["base_tax_total_amount"],
					"currencyID": AED_CURRENCY,
				}
			}
		)

	return tax_totals


def _legal_monetary_total(data: dict[str, Any]) -> dict[str, Any]:
	currency = data["currency"]
	totals = data["totals"]

	def amount(value):
		return {"value": value, "currencyID": currency}

	result = {
		"LineExtensionAmount": amount(totals["line_extension_amount"]),
		"TaxExclusiveAmount": amount(totals["tax_exclusive_amount"]),
		"TaxInclusiveAmount": amount(totals["tax_inclusive_amount"]),
		"AllowanceTotalAmount": amount(totals["allowance_total_amount"]),
		"ChargeTotalAmount": amount(totals["charge_total_amount"]),
		"PrepaidAmount": amount(totals["prepaid_amount"]),
		"PayableRoundingAmount": amount(totals["payable_rounding_amount"]),
		"PayableAmount": amount(totals["payable_amount"]),
	}

	# BTAE-20: gross amount payable in AED
	if currency != AED_CURRENCY:
		result["TaxInclusiveAmountAED"] = totals["base_tax_inclusive_amount"]
		result["PayableAmountAED"] = totals["base_payable_amount"]

	return result
