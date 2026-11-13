"""Start and ensure company trials."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, getdate, today

from taxmate.billing.constants import (
	DEFAULT_TRIAL_DAYS,
	STATUS_TRIAL,
	SUBSCRIPTION_DOCTYPE,
)


def trial_days() -> int:
	days = DEFAULT_TRIAL_DAYS
	if frappe.db.exists("DocType", "TaxMate Settings"):
		raw = frappe.db.get_single_value("TaxMate Settings", "trial_days")
		if raw is not None and int(raw) > 0:
			days = int(raw)
	return days


def ensure_company_trial(company: str, *, force_new: bool = False) -> str | None:
	"""Create a Trial subscription for ``company`` if missing. Returns subscription name."""
	if not company or not frappe.db.exists("Company", company):
		return None
	if not frappe.db.exists("DocType", SUBSCRIPTION_DOCTYPE):
		return None

	existing = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": company}, "name")
	if existing and not force_new:
		return existing

	started = getdate(today())
	ends = add_days(started, trial_days())
	doc = frappe.get_doc(
		{
			"doctype": SUBSCRIPTION_DOCTYPE,
			"company": company,
			"status": STATUS_TRIAL,
			"trial_started_on": started,
			"trial_ends_on": ends,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def ensure_trials_for_all_companies() -> int:
	"""Ensure every Company has a subscription row. Returns count created."""
	if not frappe.db.exists("DocType", SUBSCRIPTION_DOCTYPE):
		return 0
	created = 0
	for name in frappe.get_all("Company", pluck="name"):
		before = frappe.db.exists(SUBSCRIPTION_DOCTYPE, {"company": name})
		ensure_company_trial(name)
		if not before:
			created += 1
	return created
