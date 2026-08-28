"""Self-billed (purchase) PINT-AE transaction data — document types 389 / 361.

In a self-billed invoice the buyer (our Company) issues the invoice on
behalf of the seller (the Supplier). Party roles are therefore inverted
relative to the sales flow: AccountingSupplierParty is the vendor and
AccountingCustomerParty is the company.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.uae.validation import is_valid_uae_trn
from taxmate.uae_e_invoicing.utils.pint_ae import build_payload_from_data
from taxmate.uae_e_invoicing.utils.transaction_data import UAETransactionData


class UAEPurchaseTransactionData(UAETransactionData):
	"""Transaction model for a self-billed Purchase Invoice."""

	def __init__(self, doc):
		super().__init__(doc)
		self.supplier_party = frappe.get_cached_doc("Supplier", doc.supplier) if doc.supplier else None

	def get_document_type_code(self) -> str:
		explicit = self.doc.get("uae_document_type_code")
		if explicit:
			return explicit
		return "361" if self.doc.get("is_return") else "389"

	# ------------------------------------------------------------------
	# Party roles (inverted)
	# ------------------------------------------------------------------

	def _get_supplier(self) -> dict[str, Any]:
		"""Seller = the vendor (Supplier)."""
		party = self.supplier_party
		address = self._get_address(self.doc.get("supplier_address"))
		if not address:
			address = self._get_linked_address("Supplier", self.doc.supplier)

		return {
			"name": self.doc.supplier_name or self.doc.supplier,
			"trn": party.tax_id if party else None,
			"peppol_id": party.get("uae_peppol_id") if party else None,
			"trade_license_number": party.get("trade_license_number") if party else None,
			"legal_registration_identifier_type": (
				party.get("legal_registration_identifier_type") if party else None
			),
			"legal_registration_identifier": (party.get("legal_registration_identifier") if party else None),
			"address": address,
			"contact": {
				"name": self.doc.get("contact_display") or self.doc.supplier_name,
				"email": self.doc.get("contact_email") or (address or {}).get("email"),
				"phone": self.doc.get("contact_mobile") or (address or {}).get("phone"),
			},
		}

	def _get_customer(self) -> dict[str, Any]:
		"""Buyer = our Company (the self-billing party)."""
		address = self._get_address(self.doc.get("billing_address")) or self._get_linked_address(
			"Company", self.doc.company
		)
		return {
			"name": self.company.company_name or self.company.name,
			"trn": self.company.tax_id,
			"peppol_id": self.company.get("uae_peppol_id"),
			"fz_beneficiary_id": None,
			"trade_license_number": self.company.get("trade_license_number"),
			"legal_registration_identifier_type": self.company.get("legal_registration_identifier_type"),
			"legal_registration_identifier": self.company.get("legal_registration_identifier"),
			"address": address,
			"contact": {
				"name": self.company.company_name,
				"email": self.company.get("email"),
				"phone": self.company.get("phone_no"),
			},
		}

	# ------------------------------------------------------------------
	# Validation adjustments
	# ------------------------------------------------------------------

	def _check_parties(self):
		supplier = self._get_supplier()
		if not supplier["name"]:
			self.errors.append(_("Supplier legal name is required."))
		if not supplier["address"]:
			self.errors.append(_("Supplier address is required — set Supplier Address on the invoice."))
		else:
			self._check_address(supplier["address"], _("Supplier address"))

		if not supplier["trn"] and not supplier["trade_license_number"]:
			self.errors.append(
				_("Supplier must have a TRN or Trade License Number for self-billed invoices.")
			)
		elif supplier["trn"] and not is_valid_uae_trn(supplier["trn"]):
			self.errors.append(_("Supplier TRN must be a valid 15-digit UAE TRN."))

		if not supplier["peppol_id"]:
			self.errors.append(
				_(
					"Supplier Peppol Participant ID (IBT-034) is required for self-billed "
					"invoices — set it on the Supplier."
				)
			)

		customer = self._get_customer()
		if not customer["address"]:
			self.errors.append(
				_(
					"Company address is required: link an Address to {0} or set Billing Address "
					"on the invoice."
				).format(self.doc.company)
			)
		else:
			self._check_address(customer["address"], _("Company address"))

	def _check_credit_note(self):
		if not self.doc.get("is_return"):
			return
		if not self.doc.get("return_against"):
			self.errors.append(
				_("Self-billed credit notes must reference the original invoice (Return Against).")
			)

	def _get_credit_note_details(self) -> dict[str, Any] | None:
		if not self.doc.get("is_return"):
			return None

		reference = None
		if self.doc.get("return_against"):
			original_posting_date = frappe.db.get_value(
				"Purchase Invoice", self.doc.return_against, "posting_date"
			)
			reference = {
				"id": self.doc.return_against,
				"issue_date": str(original_posting_date) if original_posting_date else None,
			}

		return {"reference": reference, "reason": self.doc.get("uae_credit_note_reason")}


def build_purchase_pint_ae_payload(doc, doc_uuid: str | None = None) -> tuple[str, dict[str, Any]]:
	"""Return (uuid, payload_dict) for a self-billed Purchase Invoice.

	Callers: ``generate_and_submit`` in e_invoice.py (retry reuses ``doc_uuid``).
	API: same PINT-AE dict as sales; UUID preserved on Failed->retry.
	User: 1A-4A review fixes - item 3A reuse UUID on retry.
	"""
	data = UAEPurchaseTransactionData(doc).get_data()
	return build_payload_from_data(data, doc_uuid=doc_uuid)
