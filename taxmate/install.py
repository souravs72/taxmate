"""TaxMate install / bootstrap hooks."""

from __future__ import annotations

import frappe


def after_install():
	"""Ensure UAE regional fixtures exist before the first company is onboarded."""
	from frappe.installer import add_module_defs

	from taxmate.uae.setup import bootstrap_existing_uae_companies, ensure_uae_regional_setup

	add_module_defs("taxmate", ignore_if_duplicate=True)
	ensure_uae_regional_setup()
	_setup_vat_uae()
	_setup_e_invoicing_uae()
	bootstrap_existing_uae_companies()
	_ensure_taxmate_settings_defaults()
	_ensure_product_branding()
	from taxmate.search import configure_global_search
	from taxmate.setup.workspaces import ensure_product_workspaces

	configure_global_search()
	ensure_product_workspaces()


def after_migrate():
	"""Re-apply UAE fixtures after migrate so SaaS sites stay current."""
	after_install()


def _setup_vat_uae():
	try:
		from taxmate.uae_vat.setup import setup as vat_uae_setup

		vat_uae_setup()
	except Exception:
		frappe.log_error(
			title="TaxMate UAE VAT setup failed",
			message=frappe.get_traceback(),
		)


def _setup_e_invoicing_uae():
	try:
		from taxmate.uae_e_invoicing.setup import setup as e_invoicing_setup

		e_invoicing_setup()
	except Exception:
		frappe.log_error(
			title="TaxMate UAE E-Invoicing setup failed",
			message=frappe.get_traceback(),
		)


def _ensure_taxmate_settings_defaults():
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return

	from taxmate.uae.constants import UAE_COUNTRY

	settings = frappe.get_single("TaxMate Settings")
	changed = False
	if not settings.default_country:
		settings.default_country = UAE_COUNTRY
		changed = True
	if settings.enforce_trn_validation is None:
		settings.enforce_trn_validation = 1
		changed = True
	if settings.require_emirate_on_address is None:
		settings.require_emirate_on_address = 1
		changed = True
	notes = settings.onboarding_notes or ""
	if "ERPNext" in notes:
		settings.onboarding_notes = notes.replace("ERPNext", "TaxMate")
		changed = True
	if changed:
		settings.flags.ignore_permissions = True
		settings.save()


def _ensure_product_branding():
	"""Show TaxMate (not Frappe/ERPNext) as the product name in Desk/browser chrome."""
	for doctype, field, value in (
		("System Settings", "app_name", "TaxMate"),
		("Website Settings", "app_name", "TaxMate"),
	):
		if not frappe.db.exists("DocType", doctype):
			continue
		current = frappe.db.get_single_value(doctype, field)
		if current in (None, "", "Frappe", "ERPNext", "frappe", "erpnext"):
			frappe.db.set_single_value(doctype, field, value)

	# ERPNext Settings is replaced by TaxMate Settings workspace (setup/workspaces.py)
	if frappe.db.exists("Workspace", "ERPNext Settings"):
		frappe.db.set_value(
			"Workspace",
			"ERPNext Settings",
			{"is_hidden": 1, "public": 0},
			update_modified=False,
		)

	if frappe.db.exists("DocType", "Navbar Item"):
		for label in frappe.get_all(
			"Navbar Item",
			filters={"item_label": ("in", ["Frappe Support", "ERPNext Support"])},
			pluck="name",
		):
			frappe.db.set_value("Navbar Item", label, "item_label", "TaxMate Support", update_modified=False)
