"""SPA billing APIs. Catalogued on get_catalog; Owner pays for the company."""

from __future__ import annotations

from typing import Any

import frappe

from taxmate.api.resource import require_login
from taxmate.billing.constants import PLAN_DOCTYPE, SUBSCRIPTION_DOCTYPE
from taxmate.billing.checkout import start_checkout as _start_checkout
from taxmate.billing.entitlement import session_billing
from taxmate.billing.trial import ensure_company_trial
from taxmate.utils.company import can_use_company, get_default_company


@frappe.whitelist()
def list_plans() -> list[dict[str, Any]]:
	require_login()
	if not frappe.db.exists("DocType", PLAN_DOCTYPE):
		return []
	return frappe.get_all(
		PLAN_DOCTYPE,
		filters={"is_active": 1},
		fields=[
			"name",
			"plan_code",
			"plan_name",
			"is_popular",
			"sort_order",
			"currency",
			"monthly_amount",
			"annual_amount",
			"outlets_included",
			"back_office_users",
			"monthly_ai_scans",
			"feature_bullets",
		],
		order_by="sort_order asc",
	)


@frappe.whitelist()
def get_billing_status(company: str | None = None) -> dict[str, Any]:
	require_login()
	company = company or get_default_company()
	if company and not can_use_company(company):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
	if company:
		ensure_company_trial(company)
	return session_billing(company)


@frappe.whitelist()
def start_checkout(plan: str, billing_cycle: str, company: str | None = None) -> dict[str, Any]:
	require_login()
	company = company or get_default_company()
	if not company:
		frappe.throw(frappe._("Select a company first"))
	if not can_use_company(company):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)
	return _start_checkout(company, plan, billing_cycle)
