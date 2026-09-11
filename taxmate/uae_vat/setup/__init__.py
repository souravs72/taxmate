"""UAE VAT module setup — custom fields and related fixtures."""

from __future__ import annotations

import frappe

from taxmate.uae_vat.constants.custom_fields import CUSTOM_FIELDS
from taxmate.uae_vat.constants.special_regimes import DEFAULT_EXCISE_RATES
from taxmate.utils.custom_fields import get_custom_fields_creator

create_custom_fields = get_custom_fields_creator("UAE VAT")


def setup():
	"""Create TaxMate UAE VAT custom fields (idempotent)."""
	fields = dict(CUSTOM_FIELDS)
	if not frappe.db.exists("DocType", "Landed Cost Voucher"):
		fields.pop("Landed Cost Voucher", None)
	create_custom_fields(fields, ignore_validate=True, update=True)
	_ensure_excise_settings_defaults()
	drop_field_unique("UAE Bad Debt Relief", "sales_invoice")


def _ensure_excise_settings_defaults() -> None:
	if not frappe.db.exists("DocType", "UAE Excise Settings"):
		return
	settings = frappe.get_single("UAE Excise Settings")
	if settings.rates:
		return
	for category, rate in DEFAULT_EXCISE_RATES.items():
		settings.append("rates", {"category": category, "rate_percent": rate})
	settings.flags.ignore_permissions = True
	settings.save()


def drop_field_unique(doctype: str, fieldname: str) -> None:
	"""Drop a leftover unique index after unique is removed from the DocType JSON."""
	if not frappe.db.exists("DocType", doctype) or not frappe.db.table_exists(doctype):
		return
	table = f"tab{doctype}"
	for row in frappe.db.sql(f"SHOW INDEX FROM `{table}`", as_dict=True):
		if row.Non_unique or row.Column_name != fieldname or row.Key_name == "PRIMARY":
			continue
		frappe.db.sql_ddl(f"ALTER TABLE `{table}` DROP INDEX `{row.Key_name}`")
