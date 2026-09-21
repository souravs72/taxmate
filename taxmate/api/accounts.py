"""Party, item, chart of accounts, and payment helpers."""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import (
	_as_data,
	_parse,
	assert_allowed_doctype,
	assert_company_read,
	require_login,
)


@frappe.whitelist()
def get_defaults(company: str | None = None) -> dict[str, Any]:
	"""Company, currency, and fiscal year for new vouchers."""
	require_login()
	company = company or frappe.defaults.get_user_default("Company")
	if not company:
		return {"company": None}

	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	row = frappe.db.get_value(
		"Company",
		company,
		["name", "default_currency", "country", "tax_id", "cost_center"],
		as_dict=True,
	)
	out = {
		"company": row.name,
		"currency": row.default_currency,
		"country": row.country,
		"tax_id": row.tax_id,
		"cost_center": row.get("cost_center"),
		"fiscal_year": None,
	}
	from erpnext.accounts.utils import FiscalYearError, get_fiscal_year

	try:
		fiscal = get_fiscal_year(company=company, as_dict=True)
		if fiscal:
			out["fiscal_year"] = fiscal.name
	except FiscalYearError:
		pass
	return out


@frappe.whitelist()
def get_party_details(
	party=None,
	party_type="Customer",
	company=None,
	doctype=None,
	posting_date=None,
	price_list=None,
	currency=None,
):
	if not party:
		frappe.throw(_("party is required"))
	require_login()
	assert_allowed_doctype(party_type)
	company = company or frappe.defaults.get_user_default("Company")
	assert_company_read(company)
	if not frappe.has_permission(party_type, "read", party):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from erpnext.accounts.party import get_party_details as erp_get_party_details

	return erp_get_party_details(
		party=party,
		party_type=party_type,
		company=company,
		doctype=doctype,
		posting_date=posting_date,
		price_list=price_list,
		currency=currency,
	)


@frappe.whitelist()
def get_item_details(ctx=None, doc=None, for_validate=False, overwrite_warehouse=True):
	require_login()
	ctx = _parse(ctx) or {}
	if not ctx.get("item_code"):
		frappe.throw(_("item_code is required"))
	assert_allowed_doctype("Item")
	if not frappe.has_permission("Item", "read", ctx["item_code"]):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	assert_company_read(ctx.get("company"))

	if ctx.get("company") and not ctx.get("currency"):
		ctx["currency"] = frappe.get_cached_value("Company", ctx["company"], "default_currency")
	if ctx.get("conversion_rate") in (None, ""):
		company_currency = (
			frappe.get_cached_value("Company", ctx["company"], "default_currency") if ctx.get("company") else None
		)
		if ctx.get("currency") and company_currency and ctx["currency"] != company_currency:
			frappe.throw(_("conversion_rate is required when currency differs from company currency"))
		ctx["conversion_rate"] = 1.0

	# Callers: InvoiceForm, PurchaseInvoiceForm, PurchaseOrderForm pickItem;
	# taxmate.tests.test_api.test_item_details_when_item_exists.
	# Catalog: taxmate.api.accounts.get_item_details. Schema: Item.hs_code,
	# sac_code, uae_item_type. User: "businesses will not be able to
	# comfortably transact their business."
	from erpnext.stock.get_item_details import get_item_details as erp_get_item_details

	out = erp_get_item_details(
		ctx,
		doc=doc,
		for_validate=for_validate,
		overwrite_warehouse=overwrite_warehouse,
	)
	# Desk fetch_from does not run on SPA insert. Stamp UAE classification
	# so invoice lines can send HS/SAC without a second Item get.
	if isinstance(out, dict) and ctx.get("item_code") and frappe.db.exists("Item", ctx["item_code"]):
		item = frappe.get_cached_doc("Item", ctx["item_code"])
		for field in ("uae_item_type", "hs_code", "sac_code"):
			if item.meta.has_field(field) and not out.get(field):
				out[field] = item.get(field)
	return out


@frappe.whitelist()
def get_account_tree(company: str | None = None, parent: str | None = None, include_disabled: bool = False):
	require_login()
	assert_allowed_doctype("Account")
	if not frappe.has_permission("Account", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	company = company or frappe.defaults.get_user_default("Company")
	if not company:
		frappe.throw(_("Company is required"))
	assert_company_read(company)

	from erpnext.accounts.utils import get_children

	is_root = not parent
	return get_children(
		"Account",
		parent or company,
		company,
		is_root=is_root,
		include_disabled=include_disabled,
	)


@frappe.whitelist()
def get_outstanding_invoices(company, party_type, party, party_account=None):
	require_login()
	assert_allowed_doctype("Payment Entry")
	assert_allowed_doctype(party_type)
	if not company:
		frappe.throw(_("Company is required"))
	assert_company_read(company)
	frappe.has_permission(party_type, "read", party, throw=True)
	if not frappe.has_permission("Payment Entry", "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if not party_account:
		from erpnext.accounts.party import get_party_account

		party_account = get_party_account(party_type, party, company)

	from erpnext.accounts.doctype.payment_entry.payment_entry import (
		get_outstanding_reference_documents,
	)

	return get_outstanding_reference_documents(
		{
			"company": company,
			"party_type": party_type,
			"party": party,
			"party_account": party_account,
			"get_outstanding_invoices": True,
		}
	)


@frappe.whitelist(methods=["POST"])
def get_payment_entry(dt, dn, party_amount=None, bank_account=None, payment_type=None):
	require_login()
	assert_allowed_doctype(dt)
	assert_allowed_doctype("Payment Entry")
	doc = frappe.get_doc(dt, dn)
	doc.check_permission("read")

	from erpnext.accounts.doctype.payment_entry.payment_entry import (
		get_payment_entry as erp_get_payment_entry,
	)

	return _as_data(
		erp_get_payment_entry(
			dt,
			dn,
			party_amount=party_amount,
			bank_account=bank_account,
			payment_type=payment_type,
		)
	)


@frappe.whitelist(methods=["POST"])
def make_sales_return(source_name: str):
	require_login()
	assert_allowed_doctype("Sales Invoice")
	doc = frappe.get_doc("Sales Invoice", source_name)
	doc.check_permission("read")
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import make_sales_return as erp_make

	return _as_data(erp_make(source_name))


@frappe.whitelist(methods=["POST"])
def make_purchase_return(source_name: str):
	require_login()
	assert_allowed_doctype("Purchase Invoice")
	doc = frappe.get_doc("Purchase Invoice", source_name)
	doc.check_permission("read")
	from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import make_debit_note

	return _as_data(make_debit_note(source_name))


@frappe.whitelist()
def resolve_payment_accounts(company: str, payment_type: str, mode_of_payment: str, party_type: str, party: str):
	"""Both legs of a Payment Entry, without the user ever seeing an account.

	The Payment Entry controller never reads ``mode_of_payment`` -- ``paid_from``
	and ``paid_to`` are mandatory and nothing server-side fills them, so the
	client has to send them. In Desk that resolution is client-side
	(payment_entry.js:472). This does it on the server instead, so the
	Receive -> paid_to / Pay -> paid_from mapping lives in one place.

	It also closes two gaps in the underlying ERPNext helpers:

	* ``get_default_bank_cash_account`` has no permission check and accepts any
	  company, so a user could read another company's default bank account.
	  ``assert_company_read`` fixes that.
	* the same helper computes an account balance by default. The form does not
	  need it, so ``fetch_balance=False`` keeps it off the wire.
	"""
	require_login()
	if payment_type not in ("Receive", "Pay"):
		frappe.throw(_("Payment Type must be Receive or Pay"))
	assert_allowed_doctype("Payment Entry")
	assert_allowed_doctype(party_type)
	assert_company_read(company)
	if not frappe.has_permission("Payment Entry", "create"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	from erpnext.accounts.doctype.journal_entry.journal_entry import get_default_bank_cash_account
	from erpnext.accounts.doctype.payment_entry.payment_entry import (
		get_party_details as pe_party_details,
	)

	# Party leg. This helper does its own has_permission on the party.
	party_details = pe_party_details(company, party_type, party, frappe.utils.today())

	# Bank / cash leg.
	bank = get_default_bank_cash_account(
		company, mode_of_payment=mode_of_payment, fetch_balance=False
	) or {}
	bank_account = bank.get("account")
	if not bank_account:
		frappe.throw(
			_("Set a default account for Mode of Payment {0} in company {1}.").format(
				mode_of_payment, company
			),
			title=_("Mode of Payment"),
		)

	bank_leg = "paid_to" if payment_type == "Receive" else "paid_from"
	party_leg = "paid_from" if payment_type == "Receive" else "paid_to"

	return {
		bank_leg: bank_account,
		party_leg: party_details.get("party_account"),
		f"{bank_leg}_account_currency": bank.get("account_currency"),
		f"{party_leg}_account_currency": party_details.get("party_account_currency"),
		# What decides whether Reference No. is mandatory
		# (payment_entry.py:1248) -- the UI mirrors that rule.
		"bank_account_type": bank.get("account_type"),
		"party_name": party_details.get("party_name"),
	}
