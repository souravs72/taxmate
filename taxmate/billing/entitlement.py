"""Company subscription entitlement for SPA and API gates."""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import date_diff, getdate, today

from taxmate.billing.constants import (
	STATUS_ACTIVE,
	STATUS_PAST_DUE,
	STATUS_TRIAL,
	STATUS_UNPAID,
	SUBSCRIPTION_DOCTYPE,
)
from taxmate.setup.company_owner import OWNER_FIELD, is_app_provider
from taxmate.setup.spa_roles import MARKER


def billing_enabled() -> bool:
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return False
	return bool(frappe.db.get_single_value("TaxMate Settings", "billing_enabled"))


def billing_company() -> str | None:
	if not frappe.db.exists("DocType", "TaxMate Settings"):
		return None
	return frappe.db.get_single_value("TaxMate Settings", "billing_company") or None


def _subscription_row(company: str) -> dict[str, Any] | None:
	if not company or not frappe.db.exists("DocType", SUBSCRIPTION_DOCTYPE):
		return None
	rows = frappe.get_all(
		SUBSCRIPTION_DOCTYPE,
		filters={"company": company},
		fields=[
			"name",
			"status",
			"plan",
			"billing_cycle",
			"trial_started_on",
			"trial_ends_on",
			"current_period_start",
			"current_period_end",
		],
		limit=1,
	)
	return rows[0] if rows else None


def _is_owner_of(company: str, user: str | None = None) -> bool:
	user = user or frappe.session.user
	if not user or user in ("Guest", "Administrator"):
		return False
	if MARKER["owner"] not in frappe.get_roles(user):
		return False
	if frappe.get_meta("Company").has_field(OWNER_FIELD):
		mapped = frappe.db.get_value("Company", company, OWNER_FIELD)
		if mapped:
			return mapped == user
	# Fallback: TaxMate Owner with User Permission on this company.
	return bool(
		frappe.db.exists(
			"User Permission",
			{"user": user, "allow": "Company", "for_value": company},
		)
	)


def company_may_access(company: str | None, user: str | None = None) -> bool:
	"""True when ``user`` may use TaxMate for ``company`` under billing rules."""
	user = user or frappe.session.user
	if not billing_enabled():
		return True
	if is_app_provider(user):
		return True
	if not company:
		# No active company: allow shell chrome (switcher / billing) only.
		return True
	op = billing_company()
	if op and company == op:
		return True

	row = _subscription_row(company)
	if not row:
		return False

	status = row.get("status") or ""
	now = getdate(today())
	if status == STATUS_TRIAL:
		ends = row.get("trial_ends_on")
		return bool(ends and getdate(ends) >= now)
	if status == STATUS_ACTIVE:
		ends = row.get("current_period_end")
		return bool(ends and getdate(ends) >= now)
	return False


def session_billing(company: str | None = None, user: str | None = None) -> dict[str, Any]:
	"""Payload for get_session.billing."""
	user = user or frappe.session.user
	company = company or None
	enabled = billing_enabled()
	row = _subscription_row(company) if company else None
	provider = is_app_provider(user)
	op = billing_company()
	can_access = company_may_access(company, user)
	can_manage = provider or (bool(company) and _is_owner_of(company, user))

	status = None
	plan = None
	cycle = None
	trial_ends = None
	period_end = None
	days_left = None

	if row:
		status = row.get("status")
		plan = row.get("plan")
		cycle = row.get("billing_cycle")
		trial_ends = str(row.get("trial_ends_on") or "") or None
		period_end = str(row.get("current_period_end") or "") or None
		now = getdate(today())
		if status == STATUS_TRIAL and row.get("trial_ends_on"):
			days_left = max(0, date_diff(getdate(row.trial_ends_on), now))
		elif status == STATUS_ACTIVE and row.get("current_period_end"):
			days_left = max(0, date_diff(getdate(row.current_period_end), now))

	return {
		"enabled": enabled,
		"status": status,
		"plan": plan,
		"billing_cycle": cycle,
		"trial_ends_on": trial_ends,
		"period_end": period_end,
		"days_left": days_left,
		"can_access": can_access,
		"can_manage_billing": bool(can_manage),
		"is_operator_company": bool(op and company == op),
	}


def require_company_entitlement(company: str | None = None) -> None:
	"""Throw PermissionError when billing blocks the active company."""
	from taxmate.utils.company import get_default_company

	company = company or get_default_company()
	if company_may_access(company):
		return
	frappe.throw(
		frappe._("Your company subscription is inactive. Choose a plan to continue."),
		frappe.PermissionError,
	)


def sync_expired_statuses() -> int:
	"""Flip Trial→Unpaid and Active→Past Due when dates lapse. Returns rows updated."""
	if not frappe.db.exists("DocType", SUBSCRIPTION_DOCTYPE):
		return 0
	now = getdate(today())
	updated = 0
	for row in frappe.get_all(
		SUBSCRIPTION_DOCTYPE,
		filters={"status": STATUS_TRIAL},
		fields=["name", "trial_ends_on"],
	):
		if row.trial_ends_on and getdate(row.trial_ends_on) < now:
			frappe.db.set_value(SUBSCRIPTION_DOCTYPE, row.name, "status", STATUS_UNPAID)
			updated += 1
	for row in frappe.get_all(
		SUBSCRIPTION_DOCTYPE,
		filters={"status": STATUS_ACTIVE},
		fields=["name", "current_period_end"],
	):
		if row.current_period_end and getdate(row.current_period_end) < now:
			frappe.db.set_value(SUBSCRIPTION_DOCTYPE, row.name, "status", STATUS_PAST_DUE)
			updated += 1
	return updated
