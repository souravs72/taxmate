"""Wire Stripe → Payment Gateway Account → TaxMate Settings for SaaS checkout.

Trial itself needs no Stripe. Subscribe needs Stripe keys + PGA.

Callers:
  bench --site <site> execute taxmate.billing.setup_gateway.configure \\
    --kwargs '{"publishable_key":"pk_test_…","secret_key":"sk_test_…"}'
  bench --site <site> execute taxmate.billing.setup_gateway.status
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import get_url

from taxmate.billing.entitlement import billing_company, billing_enabled


GATEWAY_NAME = "TaxMate"
GATEWAY = f"Stripe-{GATEWAY_NAME}"
DEFAULT_REDIRECT = "/taxmate/billing/success"


def status() -> dict[str, Any]:
	"""Readiness report for operators (no secrets)."""
	op = billing_company()
	pga = frappe.db.get_single_value("TaxMate Settings", "payment_gateway_account")
	stripe = frappe.db.exists("Stripe Settings", GATEWAY_NAME)
	pk = bool(frappe.db.get_value("Stripe Settings", GATEWAY_NAME, "publishable_key")) if stripe else False
	sk = False
	if stripe:
		try:
			doc = frappe.get_doc("Stripe Settings", GATEWAY_NAME)
			sk = bool(doc.get_password("secret_key", raise_exception=False))
		except Exception:
			sk = False
	pg = frappe.db.exists("Payment Gateway", GATEWAY)
	pga_row = (
		frappe.db.get_value(
			"Payment Gateway Account",
			pga,
			["name", "payment_gateway", "payment_account", "company", "currency", "is_default"],
			as_dict=True,
		)
		if pga
		else None
	)
	bank = frappe.db.get_value("Company", op, "default_bank_account") if op else None
	return {
		"billing_enabled": billing_enabled(),
		"billing_company": op,
		"stripe_settings": GATEWAY_NAME if stripe else None,
		"has_publishable_key": pk,
		"has_secret_key": sk,
		"payment_gateway": GATEWAY if pg else None,
		"payment_gateway_account": pga_row,
		"default_bank_account": bank,
		"redirect_url": frappe.db.get_value("Stripe Settings", GATEWAY_NAME, "redirect_url") if stripe else None,
		"site_url": get_url(),
		"ready": bool(
			billing_enabled()
			and op
			and pk
			and sk
			and pg
			and pga_row
			and bank
		),
		"missing": _missing(billing_enabled(), op, pk, sk, pg, pga_row, bank),
	}


def _missing(enabled, op, pk, sk, pg, pga_row, bank) -> list[str]:
	out = []
	if not enabled:
		out.append("Enable TaxMate Settings → Billing Enabled")
	if not op:
		out.append("Set TaxMate Settings → Billing Company (operator books, e.g. Brightpath)")
	if not pk or not sk:
		out.append("Create Stripe Settings 'TaxMate' with test/live publishable + secret keys")
	if not pg:
		out.append("Save Stripe Settings so Payment Gateway Stripe-TaxMate is created")
	if not bank:
		out.append("Set Company default Bank Account on the billing company")
	if not pga_row:
		out.append("Create Payment Gateway Account and set TaxMate Settings → Payment Gateway Account")
	return out


def configure(
	publishable_key: str,
	secret_key: str,
	*,
	gateway_name: str = GATEWAY_NAME,
	redirect_url: str | None = None,
	billing_company_name: str | None = None,
) -> dict[str, Any]:
	"""Create/update Stripe Settings, PGA, and TaxMate Settings link.

	Uses Stripe test or live keys. Keys are validated against Stripe API on save.
	"""
	if not publishable_key or not secret_key:
		frappe.throw(frappe._("publishable_key and secret_key are required"))
	if not (publishable_key.startswith("pk_") and secret_key.startswith("sk_")):
		frappe.throw(frappe._("Keys must look like pk_… / sk_… (test or live)"))

	op = billing_company_name or billing_company()
	if not op:
		frappe.throw(frappe._("Set billing_company on TaxMate Settings first"))
	if not frappe.db.exists("Company", op):
		frappe.throw(frappe._("Billing company {0} not found").format(op))

	bank = frappe.db.get_value("Company", op, "default_bank_account")
	if not bank:
		frappe.throw(frappe._("Set a default Bank Account on {0}").format(op))

	frappe.db.set_single_value("TaxMate Settings", "billing_enabled", 1)
	frappe.db.set_single_value("TaxMate Settings", "billing_company", op)

	redirect = redirect_url or DEFAULT_REDIRECT
	if frappe.db.exists("Stripe Settings", gateway_name):
		doc = frappe.get_doc("Stripe Settings", gateway_name)
		doc.publishable_key = publishable_key
		doc.secret_key = secret_key
		doc.redirect_url = redirect
		doc.flags.ignore_permissions = True
		doc.save()
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Stripe Settings",
				"gateway_name": gateway_name,
				"publishable_key": publishable_key,
				"secret_key": secret_key,
				"redirect_url": redirect,
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert()

	gateway = f"Stripe-{gateway_name}"
	if not frappe.db.exists("Payment Gateway", gateway):
		frappe.throw(
			frappe._("Payment Gateway {0} was not created — check Stripe Settings save").format(gateway)
		)

	# Prefer Brightpath default bank for deposits (AED). ERPNext may also have
	# auto-created a Stripe-TaxMate bank account; we pin PGA to company bank.
	pga_name = frappe.db.get_value(
		"Payment Gateway Account",
		{"payment_gateway": gateway, "company": op},
		"name",
	)
	if pga_name:
		frappe.db.set_value(
			"Payment Gateway Account",
			pga_name,
			{
				"payment_account": bank,
				"is_default": 1,
				"payment_channel": "Email",
			},
		)
	else:
		currency = frappe.db.get_value("Account", bank, "account_currency") or frappe.db.get_value(
			"Company", op, "default_currency"
		)
		pga = frappe.get_doc(
			{
				"doctype": "Payment Gateway Account",
				"payment_gateway": gateway,
				"payment_account": bank,
				"company": op,
				"currency": currency,
				"is_default": 1,
				"payment_channel": "Email",
			}
		)
		pga.flags.ignore_permissions = True
		pga.insert()
		pga_name = pga.name

	frappe.db.set_single_value("TaxMate Settings", "payment_gateway_account", pga_name)

	# Mode of Payment account row for Brightpath (ERPNext often creates MoP on gateway enable)
	mop = gateway
	if frappe.db.exists("Mode of Payment", mop):
		mop_doc = frappe.get_doc("Mode of Payment", mop)
		has = any(r.company == op for r in mop_doc.accounts)
		if not has:
			mop_doc.append("accounts", {"company": op, "default_account": bank})
			mop_doc.flags.ignore_permissions = True
			mop_doc.save()

	frappe.db.commit()
	return status()
