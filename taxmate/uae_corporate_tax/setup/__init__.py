"""UAE Corporate Tax module setup — custom fields + per-company settings."""

from __future__ import annotations

import frappe

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_corporate_tax.constants.custom_fields import CUSTOM_FIELDS
from taxmate.utils.custom_fields import get_custom_fields_creator

create_custom_fields = get_custom_fields_creator("UAE Corporate Tax")


def setup():
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True, update=True)
	bootstrap_existing_uae_companies()


def ensure_company_ct_settings(company: str) -> None:
	"""Create UAE CT Settings for a UAE company if missing (idempotent)."""
	if not company or not frappe.db.exists("DocType", "UAE CT Settings"):
		return
	if frappe.db.exists("UAE CT Settings", company):
		return
	if frappe.db.get_value("Company", company, "country") != UAE_COUNTRY:
		return

	frappe.get_doc({"doctype": "UAE CT Settings", "company": company}).insert(ignore_permissions=True)


def bootstrap_existing_uae_companies() -> None:
	if not frappe.db.exists("DocType", "UAE CT Settings"):
		return
	companies = frappe.get_all("Company", filters={"country": UAE_COUNTRY}, pluck="name")
	for company in companies:
		try:
			ensure_company_ct_settings(company)
		except Exception:
			frappe.log_error(
				title=f"TaxMate UAE CT settings bootstrap failed for {company}",
				message=frappe.get_traceback(),
			)
