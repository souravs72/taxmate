"""Shared context for public TaxMate pages: /plans, /terms, /privacy.

Guests must be able to read these without signing in. TaxMate Plan is
System Manager only, so the plans page loads active rows with
``ignore_permissions`` and falls back to the seed SKUs if the table is empty.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.billing.constants import PLAN_DOCTYPE
from taxmate.billing.trial import trial_days
from taxmate.www.login import _support_email

FALLBACK_PLANS: list[dict[str, Any]] = [
	{
		"name": "starter",
		"plan_code": "starter",
		"plan_name": "Starter",
		"is_popular": 0,
		"sort_order": 1,
		"currency": "AED",
		"monthly_amount": 149,
		"annual_amount": 1490,
		"outlets_included": 1,
		"back_office_users": 2,
		"monthly_ai_scans": 50,
		"feature_bullets": "\n".join(
			[
				"Accounting and VAT",
				"POS cash and card totals",
				"Stock receipts and adjustments",
				"Invoice scan and P&L",
				"Email support",
			]
		),
	},
	{
		"name": "retail",
		"plan_code": "retail",
		"plan_name": "Retail",
		"is_popular": 1,
		"sort_order": 2,
		"currency": "AED",
		"monthly_amount": 249,
		"annual_amount": 2490,
		"outlets_included": 1,
		"back_office_users": 5,
		"monthly_ai_scans": 200,
		"feature_bullets": "\n".join(
			[
				"Everything in Starter",
				"Barcode checkout and shifts",
				"Live stock and low-stock alerts",
				"Item matching and margins",
				"Email and WhatsApp support",
			]
		),
	},
	{
		"name": "multi_outlet",
		"plan_code": "multi_outlet",
		"plan_name": "Multi-Outlet",
		"is_popular": 0,
		"sort_order": 3,
		"currency": "AED",
		"monthly_amount": 449,
		"annual_amount": 4490,
		"outlets_included": 2,
		"back_office_users": 10,
		"monthly_ai_scans": 500,
		"feature_bullets": "\n".join(
			[
				"Everything in Retail",
				"Multi-outlet reporting",
				"Checkout by outlet",
				"Branch transfers",
				"Priority support",
			]
		),
	},
]

PLAN_FIELDS = [
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
]


def apply_chrome(context, title: str, nav: str) -> None:
	"""Blank the Frappe website chrome and fill TaxMate nav strings."""
	context.full_width = 1
	context.no_breadcrumbs = 1
	context.no_sidebar = 1
	context.show_sidebar = 0
	context.title = title
	context.tm_nav = nav
	context.tm_app_name = context.get("app_name") or "TaxMate"
	context.tm_support_email = _support_email()
	context.tm_login_url = "/login"
	context.tm_pricing_url = "/plans"
	context.tm_terms_url = "/terms"
	context.tm_privacy_url = "/privacy"
	context.tm_year = frappe.utils.now_datetime().year
	context.tm_lang = frappe.local.lang or "en"
	context.tm_is_rtl = context.tm_lang.split("-")[0] in ("ar", "he", "fa", "ps")
	context.tm_updated = _("13 November 2026")
	context.tm_kicker = _("By Advirexa")


def trial_length() -> int:
	return trial_days()


def money_label(amount, currency: str = "AED") -> str:
	try:
		n = float(amount or 0)
	except (TypeError, ValueError):
		n = 0.0
	if n == int(n):
		body = f"{int(n):,}"
	else:
		body = f"{n:,.2f}"
	return f"{currency} {body}"


def _limits(row: dict[str, Any]) -> str:
	outlets = int(row.get("outlets_included") or 0)
	users = int(row.get("back_office_users") or 0)
	scans = int(row.get("monthly_ai_scans") or 0)
	outlet_bit = _("1 outlet") if outlets == 1 else _("{0} outlets").format(outlets)
	user_bit = _("1 user") if users == 1 else _("{0} users").format(users)
	scan_bit = _("{0} invoice scans a month").format(scans)
	return f"{outlet_bit}, {user_bit}, {scan_bit}"


def _bullets(raw) -> list[str]:
	if not raw:
		return []
	return [line.strip() for line in str(raw).replace("\r", "").split("\n") if line.strip()]


def shape_plans(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	out: list[dict[str, Any]] = []
	for row in rows:
		currency = str(row.get("currency") or "AED")
		code = str(row.get("plan_code") or row.get("name") or "")
		out.append(
			{
				"name": code,
				"plan_name": row.get("plan_name") or code,
				"is_popular": int(row.get("is_popular") or 0),
				"currency": currency,
				"monthly_amount": row.get("monthly_amount") or 0,
				"annual_amount": row.get("annual_amount") or 0,
				"monthly_label": money_label(row.get("monthly_amount"), currency),
				"annual_label": money_label(row.get("annual_amount"), currency),
				"limits": _limits(row),
				"bullets": _bullets(row.get("feature_bullets")),
			}
		)
	return out


def list_public_plans() -> list[dict[str, Any]]:
	"""Active plan SKUs for the public rate card. Safe for Guest."""
	if frappe.db.exists("DocType", PLAN_DOCTYPE):
		rows = frappe.get_all(
			PLAN_DOCTYPE,
			filters={"is_active": 1},
			fields=PLAN_FIELDS,
			order_by="sort_order asc",
			ignore_permissions=True,
		)
		if rows:
			return shape_plans(rows)
	return shape_plans(FALLBACK_PLANS)
