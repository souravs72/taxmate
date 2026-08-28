"""Peppol participant fetch / profile push against the configured ASP."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.uae_e_invoicing.constants import EMIRATE_SUBDIVISION_CODES
from taxmate.uae_e_invoicing.utils.e_invoice import get_api


def _require_flick():
	provider = frappe.db.get_single_value("UAE Tax Settings", "asp_provider") or "Sandbox"
	if provider != "Flick":
		frappe.throw(
			_("Participant operations require the Flick ASP provider in UAE Tax Settings."),
			title=_("ASP Provider"),
		)
	return get_api()


def _company_address(company: str) -> dict[str, Any]:
	address_name = frappe.db.get_value(
		"Dynamic Link",
		{"link_doctype": "Company", "link_name": company, "parenttype": "Address"},
		"parent",
	)
	if not address_name:
		return {}
	address = frappe.get_cached_doc("Address", address_name)
	country_code = frappe.db.get_value("Country", address.country, "code") if address.country else None
	emirate = address.get("emirate")
	return {
		"street_address": address.address_line1,
		"additional_street_address": address.address_line2,
		"city_address": address.city,
		"postal_zone": address.pincode,
		"emirates_code": EMIRATE_SUBDIVISION_CODES.get(emirate) if emirate else None,
		"country_code": (country_code or "AE").upper(),
		"contact_telephone": address.phone,
		"contact_email": address.email_id,
	}


def build_participant_payload(company: str) -> dict[str, Any]:
	"""Map Company + linked Address onto the Flick participant profile shape."""
	doc = frappe.get_doc("Company", company)
	address = _company_address(company)
	identifiers = []
	if doc.tax_id:
		identifiers.append({"scheme_id": "AE:TIN", "value": doc.tax_id})
	if doc.get("trade_license_number"):
		identifiers.append(
			{
				"scheme_id": f"AE:{doc.get('legal_registration_identifier_type') or 'OTH'}",
				"value": doc.trade_license_number,
			}
		)

	return {
		"trade_name": doc.company_name,
		"legal_name": doc.company_name,
		"peppol_id": doc.get("uae_peppol_id"),
		"street_address": address.get("street_address"),
		"additional_street_address": address.get("additional_street_address"),
		"city_address": address.get("city_address"),
		"postal_zone": address.get("postal_zone"),
		"emirates_code": address.get("emirates_code"),
		"country_code": address.get("country_code") or "AE",
		"identifiers": identifiers,
		"contact_name": doc.company_name,
		"contact_telephone": address.get("contact_telephone"),
		"contact_email": address.get("contact_email"),
		"fz_beneficiary_id": doc.get("uae_fz_beneficiary_id"),
	}


@frappe.whitelist()
def lookup_peppol_participant(peppol_id: str) -> dict[str, Any]:
	"""Peppol directory lookup — confirm a party is registered for exchange."""
	frappe.only_for(("System Manager", "Accounts Manager", "Accounts User"))
	if not peppol_id:
		frappe.throw(_("Peppol Participant ID is required."))

	api = get_api()
	if not hasattr(api, "lookup_participant"):
		frappe.throw(_("The configured ASP does not support Peppol directory lookup."))
	return api.lookup_participant(peppol_id)


@frappe.whitelist()
def fetch_participant_details() -> dict[str, Any]:
	"""GET participant profile from the ASP and cache it on UAE Tax Settings."""
	frappe.only_for(("System Manager", "Accounts Manager"))
	api = _require_flick()
	details = api.get_participant_details()
	frappe.db.set_single_value(
		"UAE Tax Settings",
		"participant_details",
		frappe.as_json(details, indent=2),
	)
	return details


@frappe.whitelist()
def update_participant_profile(company: str | None = None) -> dict[str, Any]:
	"""PUT company identity to the ASP participant profile."""
	frappe.only_for(("System Manager", "Accounts Manager"))
	if not company:
		company = frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Select a Company before updating the participant profile."))

	api = _require_flick()
	payload = build_participant_payload(company)
	if not payload.get("peppol_id"):
		frappe.throw(
			_("Set Peppol Participant ID on Company {0} before pushing the profile.").format(company)
		)

	response = api.update_participant(payload)
	frappe.db.set_single_value(
		"UAE Tax Settings",
		"participant_details",
		frappe.as_json({"pushed_payload": payload, "response": response}, indent=2),
	)
	return response
