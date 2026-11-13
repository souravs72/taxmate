"""Seed retail TaxMate Plans and start a 7-day trial for every Company."""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


PLANS = [
	{
		"plan_code": "starter",
		"plan_name": "Starter",
		"is_active": 1,
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
				"Invoice scan + P&L",
				"Email support",
			]
		),
	},
	{
		"plan_code": "retail",
		"plan_name": "Retail",
		"is_active": 1,
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
				"Email + WhatsApp support",
			]
		),
	},
	{
		"plan_code": "multi_outlet",
		"plan_name": "Multi-Outlet",
		"is_active": 1,
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


def _ensure_si_custom_fields():
	create_custom_fields(
		{
			"Sales Invoice": [
				{
					"fieldname": "custom_taxmate_company",
					"label": "TaxMate Subscriber Company",
					"fieldtype": "Link",
					"options": "Company",
					"insert_after": "company",
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
					"translatable": 0,
				},
				{
					"fieldname": "custom_taxmate_plan",
					"label": "TaxMate Plan",
					"fieldtype": "Link",
					"options": "TaxMate Plan",
					"insert_after": "custom_taxmate_company",
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
					"translatable": 0,
				},
				{
					"fieldname": "custom_taxmate_billing_cycle",
					"label": "TaxMate Billing Cycle",
					"fieldtype": "Select",
					"options": "\nMonthly\nAnnual",
					"insert_after": "custom_taxmate_plan",
					"read_only": 1,
					"no_copy": 1,
					"print_hide": 1,
					"translatable": 0,
				},
			]
		},
		update=True,
	)


def _seed_plans():
	if not frappe.db.exists("DocType", "TaxMate Plan"):
		return
	if not frappe.db.exists("Currency", "AED"):
		# Currency usually exists on UAE sites; skip amounts validation otherwise
		pass
	for row in PLANS:
		name = row["plan_code"]
		if frappe.db.exists("TaxMate Plan", name):
			doc = frappe.get_doc("TaxMate Plan", name)
			doc.update(row)
			doc.save(ignore_permissions=True)
		else:
			frappe.get_doc({"doctype": "TaxMate Plan", **row}).insert(ignore_permissions=True)


def execute():
	_ensure_si_custom_fields()
	_seed_plans()
	if frappe.db.exists("DocType", "TaxMate Settings"):
		frappe.db.set_single_value("TaxMate Settings", "trial_days", 7)
	from taxmate.billing.trial import ensure_trials_for_all_companies

	ensure_trials_for_all_companies()
