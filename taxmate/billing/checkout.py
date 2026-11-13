"""Create SaaS Sales Invoice + Payment Request for Stripe checkout."""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import flt, today

from taxmate.billing.constants import (
	CYCLE_ANNUAL,
	CYCLE_MONTHLY,
	PLAN_DOCTYPE,
	SI_COMPANY_FIELD,
	SI_CYCLE_FIELD,
	SI_PLAN_FIELD,
	SUBSCRIPTION_DOCTYPE,
)
from taxmate.billing.entitlement import billing_company, billing_enabled
from taxmate.billing.trial import ensure_company_trial
from taxmate.setup.company_owner import is_app_provider
from taxmate.setup.spa_roles import MARKER


def _settings() -> dict[str, Any]:
	if not billing_enabled():
		frappe.throw(frappe._("Billing is not enabled"))
	op = billing_company()
	pga = frappe.db.get_single_value("TaxMate Settings", "payment_gateway_account")
	if not op:
		frappe.throw(frappe._("Billing Company is not configured in TaxMate Settings"))
	if not pga:
		frappe.throw(frappe._("Payment Gateway Account is not configured in TaxMate Settings"))
	return {"billing_company": op, "payment_gateway_account": pga}


def _assert_owner(company: str) -> None:
	user = frappe.session.user
	if is_app_provider(user):
		return
	if MARKER["owner"] not in frappe.get_roles(user):
		frappe.throw(frappe._("Only the company owner can subscribe"), frappe.PermissionError)
	from taxmate.billing.entitlement import _is_owner_of

	if not _is_owner_of(company, user):
		frappe.throw(frappe._("Only the company owner can subscribe"), frappe.PermissionError)


def _ensure_billing_customer(company: str, operator: str) -> str:
	"""Customer on operator books representing the tenant company."""
	sub_name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": company}, "name")
	if sub_name:
		existing = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, sub_name, "billing_customer")
		if existing and frappe.db.exists("Customer", existing):
			return existing

	# Prefer a Customer named after the company on the operator site
	customer_name = frappe.db.get_value("Customer", {"customer_name": company}, "name")
	if not customer_name:
		doc = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": company,
				"customer_type": "Company",
			}
		)
		# Optional company field on Customer
		if frappe.get_meta("Customer").has_field("custom_company"):
			doc.custom_company = operator
		doc.insert(ignore_permissions=True)
		customer_name = doc.name

	if sub_name:
		frappe.db.set_value(SUBSCRIPTION_DOCTYPE, sub_name, "billing_customer", customer_name)
	return customer_name


def _income_item(operator: str) -> str:
	"""Non-stock item for SaaS plan lines; create once if missing."""
	code = "TAXMATE-PLAN"
	if frappe.db.exists("Item", code):
		return code
	item = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": "TaxMate Subscription",
			"item_group": frappe.db.get_value("Item Group", {"name": ["like", "%Service%"]}, "name")
			or frappe.db.get_value("Item Group", {}, "name"),
			"stock_uom": "Nos",
			"is_stock_item": 0,
			"is_sales_item": 1,
			"is_purchase_item": 0,
		}
	)
	item.insert(ignore_permissions=True)
	return item.name


def start_checkout(company: str, plan: str, billing_cycle: str) -> dict[str, Any]:
	"""Owner starts Stripe checkout. Returns payment_url + references."""
	_assert_owner(company)
	cfg = _settings()
	if company == cfg["billing_company"]:
		frappe.throw(frappe._("The billing company does not need a subscription"))

	if billing_cycle not in (CYCLE_MONTHLY, CYCLE_ANNUAL):
		frappe.throw(frappe._("Invalid billing cycle"))
	if not frappe.db.exists(PLAN_DOCTYPE, plan):
		frappe.throw(frappe._("Unknown plan"))
	plan_doc = frappe.get_cached_doc(PLAN_DOCTYPE, plan)
	if not plan_doc.is_active:
		frappe.throw(frappe._("This plan is not available"))

	amount = flt(plan_doc.annual_amount if billing_cycle == CYCLE_ANNUAL else plan_doc.monthly_amount)
	if amount <= 0:
		frappe.throw(frappe._("Plan amount is not configured"))

	ensure_company_trial(company)
	operator = cfg["billing_company"]
	customer = _ensure_billing_customer(company, operator)
	item = _income_item(operator)

	si = frappe.get_doc(
		{
			"doctype": "Sales Invoice",
			"company": operator,
			"customer": customer,
			"posting_date": today(),
			"due_date": today(),
			"currency": plan_doc.currency or "AED",
			"items": [
				{
					"item_code": item,
					"qty": 1,
					"rate": amount,
					"description": f"TaxMate {plan_doc.plan_name} ({billing_cycle})",
				}
			],
		}
	)
	if si.meta.has_field(SI_COMPANY_FIELD):
		si.set(SI_COMPANY_FIELD, company)
	if si.meta.has_field(SI_PLAN_FIELD):
		si.set(SI_PLAN_FIELD, plan)
	if si.meta.has_field(SI_CYCLE_FIELD):
		si.set(SI_CYCLE_FIELD, billing_cycle)
	si.insert(ignore_permissions=True)
	si.submit()

	# Build Payment Request as the operator — company owners are not Desk users
	# on the billing company and cannot pass stock make_payment_request ACL.
	gateway = frappe.db.get_value(
		"Payment Gateway Account",
		cfg["payment_gateway_account"],
		["name", "payment_gateway", "payment_account", "payment_channel", "message"],
		as_dict=True,
	)
	if not gateway:
		frappe.throw(frappe._("Payment Gateway Account is invalid"))

	pr_doc = frappe.get_doc(
		{
			"doctype": "Payment Request",
			"payment_request_type": "Inward",
			"transaction_date": today(),
			"party_type": "Customer",
			"party": customer,
			"reference_doctype": "Sales Invoice",
			"reference_name": si.name,
			"grand_total": si.grand_total,
			"currency": si.currency,
			"company": operator,
			"payment_gateway_account": gateway.name,
			"payment_gateway": gateway.payment_gateway,
			"payment_account": gateway.payment_account,
			"payment_channel": gateway.payment_channel,
			"mute_email": 1,
			"email_to": frappe.session.user,
			"subject": f"TaxMate subscription — {company}",
		}
	)
	pr_doc.insert(ignore_permissions=True)
	pr_doc.flags.ignore_permissions = True
	pr_doc.submit()
	pr_name = pr_doc.name

	sub_name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": company}, "name")
	if sub_name:
		frappe.db.set_value(
			SUBSCRIPTION_DOCTYPE,
			sub_name,
			{"last_sales_invoice": si.name, "last_payment_request": pr_name, "plan": plan, "billing_cycle": billing_cycle},
		)

	payment_url = pr_doc.get_payment_url()
	return {
		"sales_invoice": si.name,
		"payment_request": pr_name,
		"payment_url": payment_url,
		"amount": amount,
		"currency": plan_doc.currency or "AED",
		"plan": plan,
		"billing_cycle": billing_cycle,
	}
