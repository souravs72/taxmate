"""Phase 3 mandate helpers: B2C exclusion, VAT-group TIN, 14-day SLA.

Also MD 244/2025 (Res. 66/2026) cohort/date awareness — see the section below.
"""

from __future__ import annotations

import frappe
from frappe import _

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


# --- Mandate phase / cohort awareness ---------------------------------------
# MD 244/2025 (as amended by Res. 66/2026) stages ASP appointment and go-live
# by government status and last-period *financial-statement* revenue. TaxMate
# does not infer Large vs SME from the general ledger.


def _has_site_db() -> bool:
	"""True only when Frappe local is bound to a real site database."""
	local = getattr(frappe, "local", None)
	if not local or not getattr(local, "site", None):
		return False
	try:
		return frappe.db is not None
	except RuntimeError:
		return False


def is_government_entity(company: str) -> bool:
	from frappe.utils import cint

	if not _has_site_db():
		return False
	if not frappe.db.has_column("Company", "uae_is_government_entity"):
		return False
	return cint(frappe.db.get_value("Company", company, "uae_is_government_entity")) == 1


def cohort_override(company: str) -> str | None:
	"""Explicit cohort on Company, if any (overrides auto-classification)."""
	if not _has_site_db():
		return None
	if not frappe.db.has_column("Company", "uae_e_invoice_cohort_override"):
		return None
	value = frappe.db.get_value("Company", company, "uae_e_invoice_cohort_override")
	if value and value != "Auto":
		return value
	return None


def company_revenue_band(company: str) -> str | None:
	"""MD 244 FS revenue band stored on Company, or None if not yet set."""
	if not _has_site_db():
		return None
	if not frappe.db.has_column("Company", "uae_e_invoice_revenue_band"):
		return None
	return frappe.db.get_value("Company", company, "uae_e_invoice_revenue_band") or None


def determine_cohort(
	company: str,
	revenue: float | None = None,
	as_of_date=None,
	revenue_band: str | None = None,
	government: bool | None = None,
	override: str | None = None,
) -> str:
	"""Classify into Pilot / Large / SME / Government / Unclassified.

	Override (if not Auto) wins. Else government → Government. Else the MD 244
	FS revenue band → Large or SME. ``revenue`` is only a numeric stand-in for
	that band (for tests). Missing band → Unclassified. GL is never consulted.
	``as_of_date`` is unused; kept so existing callers stay valid.
	"""
	from taxmate.uae_e_invoicing.constants import (
		EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED,
		EINVOICE_REVENUE_BAND_AT_OR_ABOVE,
		EINVOICE_REVENUE_BAND_BELOW,
	)

	_ = as_of_date
	resolved_override = cohort_override(company) if override is None else override
	if resolved_override and resolved_override != "Auto":
		return resolved_override

	is_gov = is_government_entity(company) if government is None else government
	if is_gov:
		return "Government"

	if revenue is not None:
		return "Large" if revenue >= EINVOICE_LARGE_BUSINESS_REVENUE_THRESHOLD_AED else "SME"

	band = company_revenue_band(company) if revenue_band is None else revenue_band
	if band == EINVOICE_REVENUE_BAND_AT_OR_ABOVE:
		return "Large"
	if band == EINVOICE_REVENUE_BAND_BELOW:
		return "SME"
	return "Unclassified"


def get_phase_dates(cohort: str) -> dict:
	from taxmate.uae_e_invoicing.constants import EINVOICE_MANDATE_PHASES

	phase = EINVOICE_MANDATE_PHASES.get(cohort)
	if not phase:
		message = _("Unknown e-invoicing mandate cohort: {0}").format(cohort)
		if getattr(getattr(frappe, "local", None), "site", None):
			frappe.throw(message)
		raise ValueError(str(message))
	return dict(phase)


def mandate_status(
	company: str,
	as_of_date=None,
	revenue: float | None = None,
	revenue_band: str | None = None,
	government: bool | None = None,
	override: str | None = None,
) -> dict:
	"""Cohort, MD 244 dates, and countdowns. Pure when band/revenue/flags are passed."""
	from frappe.utils import date_diff, getdate, nowdate

	from taxmate.uae_e_invoicing.constants import EINVOICE_MANDATE_DISCLAIMER

	today = getdate(as_of_date or nowdate())
	cohort = determine_cohort(
		company,
		revenue=revenue,
		as_of_date=today,
		revenue_band=revenue_band,
		government=government,
		override=override,
	)
	phase = get_phase_dates(cohort)
	asp_deadline = getdate(phase["asp_deadline"]) if phase.get("asp_deadline") else None
	go_live = getdate(phase["go_live"]) if phase.get("go_live") else None

	return {
		"company": company,
		"cohort": cohort,
		"cohort_label": phase.get("label"),
		"asp_appointment_deadline": phase.get("asp_deadline"),
		"go_live_date": phase.get("go_live"),
		"days_to_asp_deadline": date_diff(asp_deadline, today) if asp_deadline else None,
		"days_to_go_live": date_diff(go_live, today) if go_live else None,
		"asp_deadline_passed": bool(asp_deadline and today > asp_deadline),
		"go_live_passed": bool(go_live and today > go_live),
		"mandate_live": bool(go_live and today >= go_live),
		"disclaimer": EINVOICE_MANDATE_DISCLAIMER,
	}


def mandate_reminder_payload(status: dict, window_days: int) -> dict | None:
	"""Pure: which ToDo to raise for this mandate status, or None if none yet.

	Returns structured facts. ``notifications`` translates them on a live site.
	"""
	from taxmate.uae_e_invoicing.constants import (
		EINVOICE_CLASSIFY_TODO_KEY,
		EINVOICE_MANDATE_TODO_KEY,
	)

	cohort = status.get("cohort")
	if cohort == "Unclassified":
		return {
			"unique_key": EINVOICE_CLASSIFY_TODO_KEY,
			"kind": "classify",
			"company": status.get("company") or "",
			"disclaimer": status.get("disclaimer") or "",
		}

	days_asp = status.get("days_to_asp_deadline")
	days_live = status.get("days_to_go_live")
	in_asp = days_asp is not None and days_asp <= window_days
	in_live = days_live is not None and days_live <= window_days
	if not in_asp and not in_live:
		return None

	reasons = []
	if in_asp:
		reasons.append("asp_passed" if status.get("asp_deadline_passed") else "asp_upcoming")
	if in_live:
		reasons.append("go_live_now" if status.get("mandate_live") else "go_live_upcoming")

	return {
		"unique_key": EINVOICE_MANDATE_TODO_KEY,
		"kind": "mandate",
		"reasons": reasons,
		"company": status.get("company") or "",
		"cohort": cohort,
		"asp_appointment_deadline": status.get("asp_appointment_deadline"),
		"go_live_date": status.get("go_live_date"),
		"days_to_asp_deadline": days_asp,
		"days_to_go_live": days_live,
		"disclaimer": status.get("disclaimer") or "",
	}


@frappe.whitelist()
def get_e_invoice_mandate_status(company: str) -> dict:
	"""Desk-callable: this company's e-invoicing mandate cohort, dates, countdowns."""
	if not company:
		frappe.throw(_("Company is required"))
	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return mandate_status(company)
