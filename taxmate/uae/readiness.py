"""UAE readiness checklist for Desk (TaxMate-owned)."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae.constants import UAE_COUNTRY, UAE_TAX_PRINT_FORMATS
from taxmate.uae.setup import company_has_uae_tax_templates
from taxmate.uae.validation import is_valid_uae_trn


@frappe.whitelist()
def get_uae_readiness_checklist(company: str) -> dict:
	"""Return a checklist of UAE VAT readiness items for a company."""
	if not company:
		frappe.throw(_("Company is required"))

	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	country = frappe.db.get_value("Company", company, "country")
	if country != UAE_COUNTRY:
		return {
			"applicable": False,
			"company": company,
			"country": country,
			"items": [],
			"ready": True,
			"message": _("UAE readiness checks apply only when Company country is {0}.").format(UAE_COUNTRY),
		}

	tax_id = frappe.db.get_value("Company", company, "tax_id")
	items = [
		_item(
			"trn",
			_("Company Tax ID (TRN)"),
			bool(tax_id) and is_valid_uae_trn(tax_id),
			_("Set a 15-digit Tax Registration Number on the Company."),
			"/app/company/" + company,
		),
		_item(
			"tax_templates",
			_("UAE VAT tax templates"),
			company_has_uae_tax_templates(company),
			_("Expected templates: UAE VAT 5%, Zero, and Exempted for this company."),
			"/app/sales-taxes-and-charges-template",
		),
		_item(
			"vat_settings",
			_("UAE VAT Settings"),
			_has_vat_settings_with_accounts(company),
			_("Create UAE VAT Settings and link VAT accounts for this company."),
			"/app/uae-vat-settings",
		),
		_item(
			"address_emirate",
			_("Company address with Emirate"),
			_has_company_address_with_emirate(company),
			_("Add a company address and set the Emirate (Place of Supply)."),
			"/app/address",
		),
		_item(
			"print_formats",
			_("Tax invoice print formats enabled"),
			_print_formats_enabled(),
			_("Enable Simplified Tax Invoice / Detailed Tax Invoice print formats."),
			"/app/print-format",
		),
		_item(
			"trade_license",
			_("Trade License Number"),
			_has_company_field(company, "trade_license_number"),
			_("Set Trade License Number on the Company (required for e-invoicing)."),
			"/app/company/" + company,
		),
		_item(
			"peppol_id",
			_("Peppol Participant ID"),
			_has_company_field(company, "uae_peppol_id"),
			_("Set the company's Peppol Participant ID (IBT-034) for e-invoice exchange."),
			"/app/company/" + company,
		),
		_item(
			"e_invoice_enabled",
			_("UAE E-Invoicing enabled"),
			_has_company_check(company, "uae_e_invoice_enabled"),
			_("Enable UAE E-Invoicing on the Company when ready to generate PINT-AE documents."),
			"/app/company/" + company,
		),
		_item(
			"uae_tax_settings",
			_("UAE Tax Settings configured"),
			_has_uae_tax_settings(),
			_("Configure ASP provider / sandbox in UAE Tax Settings."),
			"/app/uae-tax-settings",
		),
	]

	ready = all(i["ok"] for i in items)
	return {
		"applicable": True,
		"company": company,
		"country": country,
		"items": items,
		"ready": ready,
		"message": _("UAE VAT setup is complete.")
		if ready
		else _("Complete the remaining UAE VAT setup items below."),
	}


def _item(key: str, label: str, ok: bool, help_text: str, route: str) -> dict:
	return {
		"key": key,
		"label": label,
		"ok": ok,
		"help": help_text,
		"route": route,
	}


def _has_vat_settings_with_accounts(company: str) -> bool:
	if not frappe.db.exists("UAE VAT Settings", company):
		return False
	return bool(frappe.db.exists("UAE VAT Account", {"parent": company, "parenttype": "UAE VAT Settings"}))


def _has_company_address_with_emirate(company: str) -> bool:
	addresses = frappe.get_all(
		"Dynamic Link",
		filters={
			"link_doctype": "Company",
			"link_name": company,
			"parenttype": "Address",
		},
		pluck="parent",
	)
	if not addresses:
		return False

	for address_name in addresses:
		emirate = frappe.db.get_value("Address", address_name, "emirate")
		if emirate:
			return True
	return False


def _print_formats_enabled() -> bool:
	for name in UAE_TAX_PRINT_FORMATS:
		if not frappe.db.exists("Print Format", name):
			return False
		if frappe.db.get_value("Print Format", name, "disabled"):
			return False
	return True


def _has_company_field(company: str, fieldname: str) -> bool:
	if not frappe.db.has_column("Company", fieldname):
		return False
	return bool(frappe.db.get_value("Company", company, fieldname))


def _has_company_check(company: str, fieldname: str) -> bool:
	if not frappe.db.has_column("Company", fieldname):
		return False
	return bool(frappe.db.get_value("Company", company, fieldname))


def _has_uae_tax_settings() -> bool:
	if not frappe.db.exists("DocType", "UAE Tax Settings"):
		return False
	settings = frappe.get_single("UAE Tax Settings")
	return bool(settings.asp_provider)
