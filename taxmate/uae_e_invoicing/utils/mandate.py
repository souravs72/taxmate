"""Phase 3 mandate helpers: B2C exclusion, VAT-group TIN, 14-day SLA."""

from __future__ import annotations

from taxmate.uae.validation import is_valid_uae_trn, normalize_trn
from taxmate.uae_e_invoicing.constants import ARCHIVE_RETENTION_YEARS, TRANSMISSION_SLA_DAYS


def get_sla_days() -> int:
	"""Transmission window from UAE Tax Settings, else the 14-day FTA default."""
	import frappe
	from frappe.utils import cint

	if not getattr(frappe.local, "site", None):
		return TRANSMISSION_SLA_DAYS
	if not frappe.db.exists("DocType", "UAE Tax Settings"):
		return TRANSMISSION_SLA_DAYS
	if not frappe.db.exists("Singles", {"doctype": "UAE Tax Settings", "field": "sla_days"}):
		return TRANSMISSION_SLA_DAYS
	days = cint(frappe.db.get_single_value("UAE Tax Settings", "sla_days"))
	return days if days > 0 else TRANSMISSION_SLA_DAYS


def setting_on(fieldname: str, default: int = 0) -> bool:
	"""Read a UAE Tax Settings Check; missing Singles row uses ``default``."""
	import frappe
	from frappe.utils import cint

	if not getattr(frappe.local, "site", None):
		return bool(default)
	if not frappe.db.exists("DocType", "UAE Tax Settings"):
		return bool(default)
	if not frappe.db.exists("Singles", {"doctype": "UAE Tax Settings", "field": fieldname}):
		return bool(default)
	return cint(frappe.db.get_single_value("UAE Tax Settings", fieldname)) == 1


def get_retention_years() -> int:
	import frappe
	from frappe.utils import cint

	if not getattr(frappe.local, "site", None):
		return ARCHIVE_RETENTION_YEARS
	if not frappe.db.exists("DocType", "UAE Tax Settings"):
		return ARCHIVE_RETENTION_YEARS
	if not frappe.db.exists("Singles", {"doctype": "UAE Tax Settings", "field": "archive_retention_years"}):
		return ARCHIVE_RETENTION_YEARS
	years = cint(frappe.db.get_single_value("UAE Tax Settings", "archive_retention_years"))
	return years if years >= ARCHIVE_RETENTION_YEARS else ARCHIVE_RETENTION_YEARS


def vat_group_tin(trn: str | None) -> str | None:
	"""First 10 digits of a 15-digit UAE TRN (VAT Group TIN)."""
	cleaned = normalize_trn(trn)
	if cleaned and len(cleaned) >= 10:
		return cleaned[:10]
	return None


def is_b2c_party(tax_id: str | None) -> bool:
	"""B2C until the FTA requires consumer e-invoices: no valid 15-digit TRN."""
	return not is_valid_uae_trn(tax_id)


def sla_due_date(issued_on, sla_days: int | None = None):
	from frappe.utils import add_days, getdate

	if not issued_on:
		return None
	days = get_sla_days() if sla_days is None else sla_days
	return add_days(getdate(issued_on), days)


def sla_status(issued_on, accepted_on, today=None, sla_days: int | None = None) -> str:
	"""Met / Late / Breached / Open / — for the transmission window."""
	from frappe.utils import getdate, nowdate

	if not issued_on:
		return "—"
	days = get_sla_days() if sla_days is None else sla_days
	due = sla_due_date(issued_on, days)
	today = getdate(today or nowdate())
	if accepted_on:
		return "Met" if getdate(accepted_on) <= due else "Late"
	if today > due:
		return "Breached"
	return "Open"
