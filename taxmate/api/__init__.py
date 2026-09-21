"""TaxMate accounts API. UAE methods are catalogued, not wrapped again."""

from __future__ import annotations

from typing import Any

import frappe

from taxmate.api.resource import require_login
from taxmate.search import ALLOWED_SEARCH_DOCTYPES, DENIED_SEARCH_DOCTYPES, GLOBAL_SEARCH_DOCTYPES
from taxmate.setup.financial_reports import CORE_REPORT_LINKS, TAXMATE_REPORT_LINKS
from taxmate.setup.home import DAILY_SHORTCUTS, HOME_LINKS, UAE_SHORTCUTS
from taxmate.setup.spa_roles import spa_role_of

# Masters a books frontend needs that are not always in global search.
_CORE_MASTERS: tuple[str, ...] = (
	"Company",
	"Account",
	"Customer",
	"Supplier",
	"Item",
	"Warehouse",
	"Address",
	"Contact",
	"Mode of Payment",
	"Cost Center",
	"Bank Account",
	"Fiscal Year",
	"Currency",
	"Sales Taxes and Charges Template",
	"Purchase Taxes and Charges Template",
	"Item Tax Template",
	"Tax Category",
	"Payment Terms Template",
	"Terms and Conditions",
	"Brand",
	"UOM",
	"Customer Group",
	"Supplier Group",
	"Item Group",
	"Territory",
	"TaxMate Settings",
	"Accounts Settings",
	"Selling Settings",
	"Buying Settings",
	"Item Price",
	"ToDo",
	"Delivery Note",
	"UAE Tax Settings",
)

# Existing TaxMate whitelist methods (not re-wrapped).
_EXISTING_ACTIONS: tuple[dict[str, str], ...] = (
	{
		"name": "get_uae_readiness_checklist",
		"method": "taxmate.uae.readiness.get_uae_readiness_checklist",
	},
	{
		"name": "get_e_invoice_mandate_status",
		"method": "taxmate.uae_e_invoicing.utils.mandate.get_e_invoice_mandate_status",
	},
	{
		"name": "generate_e_invoice",
		"method": "taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice",
	},
	{
		"name": "sync_e_invoice_status",
		"method": "taxmate.uae_e_invoicing.utils.e_invoice.sync_status_from_asp",
	},
	{
		"name": "fetch_e_invoice_documents",
		"method": "taxmate.uae_e_invoicing.utils.e_invoice.fetch_asp_documents",
	},
	{
		"name": "bulk_generate_e_invoices",
		"method": "taxmate.uae_e_invoicing.utils.e_invoice.bulk_generate_e_invoices",
	},
	{
		"name": "draft_purchase_invoice_from_incoming",
		"method": "taxmate.uae_e_invoicing.doctype.uae_incoming_invoice.uae_incoming_invoice.create_purchase_invoice",
	},
	{
		"name": "lookup_peppol_participant",
		"method": "taxmate.uae_e_invoicing.utils.participant.lookup_peppol_participant",
	},
	{
		"name": "get_or_create_vat_201",
		"method": "taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.get_or_create",
	},
	{
		"name": "generate_vat_201",
		"method": "taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.generate_filing",
	},
	{
		"name": "get_ct_elections",
		"method": "taxmate.uae_corporate_tax.utils.corporate_tax.get_ct_elections",
	},
)


def catalog_doctypes() -> list[str]:
	names = set(GLOBAL_SEARCH_DOCTYPES)
	names.update(_CORE_MASTERS)
	for doctype in ALLOWED_SEARCH_DOCTYPES:
		if doctype.startswith(("UAE ", "TaxMate", "IDP ")):
			names.add(doctype)
	for row in (*DAILY_SHORTCUTS, *UAE_SHORTCUTS, *HOME_LINKS):
		link_to = row.get("link_to")
		kind = row.get("type") or row.get("link_type")
		if link_to and kind == "DocType":
			names.add(link_to)
	return sorted(
		name
		for name in names
		if name not in DENIED_SEARCH_DOCTYPES and frappe.db.exists("DocType", name)
	)


def catalog_reports() -> list[dict[str, str]]:
	out: list[dict[str, str]] = []
	seen: set[str] = set()
	for label, report in (*CORE_REPORT_LINKS, *TAXMATE_REPORT_LINKS):
		if report in seen:
			continue
		if not frappe.db.exists("Report", report):
			continue
		if frappe.db.get_value("Report", report, "disabled"):
			continue
		seen.add(report)
		out.append({"label": label, "report": report})
	return out


@frappe.whitelist()
def get_catalog() -> dict[str, Any]:
	require_login()

	resources = []
	for doctype in catalog_doctypes():
		meta = frappe.get_meta(doctype)
		resources.append(
			{
				"doctype": doctype,
				"module": meta.module,
				"issingle": int(meta.issingle or 0),
				"is_submittable": int(meta.is_submittable or 0),
				"is_tree": int(meta.is_tree or 0),
			}
		)

	return {
		"resources": resources,
		"reports": catalog_reports(),
		"nav": {
			"daily": [row["label"] for row in DAILY_SHORTCUTS],
			"uae": [row["label"] for row in UAE_SHORTCUTS],
			"cards": [row["label"] for row in HOME_LINKS if row.get("type") == "Card Break"],
		},
		"actions": [
			{"name": "get_list", "method": "taxmate.api.resource.get_list"},
			{"name": "get", "method": "taxmate.api.resource.get"},
			{"name": "insert", "method": "taxmate.api.resource.insert"},
			{"name": "save", "method": "taxmate.api.resource.save"},
			{"name": "delete", "method": "taxmate.api.resource.delete"},
			{"name": "get_count", "method": "taxmate.api.resource.get_count"},
			{"name": "group_by_count", "method": "taxmate.api.resource.group_by_count"},
			{"name": "get_meta", "method": "taxmate.api.resource.get_meta"},
			{"name": "search_link", "method": "taxmate.api.resource.search_link"},
			{"name": "submit", "method": "taxmate.api.workflow.submit"},
			{"name": "cancel", "method": "taxmate.api.workflow.cancel"},
			{"name": "amend", "method": "taxmate.api.workflow.amend"},
			{"name": "get_party_details", "method": "taxmate.api.accounts.get_party_details"},
			{"name": "get_item_details", "method": "taxmate.api.accounts.get_item_details"},
			{"name": "get_account_tree", "method": "taxmate.api.accounts.get_account_tree"},
			{"name": "get_defaults", "method": "taxmate.api.accounts.get_defaults"},
			{"name": "get_outstanding_invoices", "method": "taxmate.api.accounts.get_outstanding_invoices"},
			{"name": "get_payment_entry", "method": "taxmate.api.accounts.get_payment_entry"},
			{"name": "resolve_payment_accounts", "method": "taxmate.api.accounts.resolve_payment_accounts"},
			{"name": "make_sales_return", "method": "taxmate.api.accounts.make_sales_return"},
			{"name": "make_purchase_return", "method": "taxmate.api.accounts.make_purchase_return"},
			{"name": "run_report", "method": "taxmate.api.reports.run_report"},
			{"name": "list_reports", "method": "taxmate.api.reports.list_reports"},
			{"name": "get_home", "method": "taxmate.api.dashboard.get_home"},
			{
				"name": "fulfilment_summary",
				"method": "taxmate.api.sales_order.fulfilment_summary",
			},
			{"name": "linked_documents", "method": "taxmate.api.sales_order.linked_documents"},
			{"name": "make_delivery_note", "method": "taxmate.api.sales_order.make_delivery_note"},
			{"name": "make_sales_invoice", "method": "taxmate.api.sales_order.make_sales_invoice"},
			{"name": "awesome_search", "method": "taxmate.api.search.awesome"},
			{"name": "list_users", "method": "taxmate.api.users.list_users"},
			{"name": "invite_user", "method": "taxmate.api.users.invite_user"},
			{"name": "set_user_role", "method": "taxmate.api.users.set_user_role"},
			{"name": "set_user_enabled", "method": "taxmate.api.users.set_user_enabled"},
			{"name": "get_session", "method": "taxmate.api.get_session"},
			{"name": "get_catalog", "method": "taxmate.api.get_catalog"},
			*_EXISTING_ACTIONS,
		],
	}


@frappe.whitelist()
def get_session() -> dict[str, Any]:
	require_login()

	company = frappe.defaults.get_user_default("Company")
	currency = None
	country = None
	if company and frappe.has_permission("Company", "read", company):
		currency, country = frappe.db.get_value("Company", company, ["default_currency", "country"]) or (
			None,
			None,
		)

	return {
		"user": frappe.session.user,
		"full_name": frappe.utils.get_fullname(frappe.session.user),
		"company": company,
		"currency": currency,
		"country": country,
		"roles": frappe.get_roles(),
		"spa_role": spa_role_of(),
		# The SITE's today, not the browser's. Anything date-driven in the UI
		# -- most of all whether an invoice is overdue -- has to agree with the
		# server, and a viewer outside Asia/Dubai is a day off for part of it.
		"today": frappe.utils.today(),
		"time_zone": frappe.utils.get_system_timezone(),
	}
