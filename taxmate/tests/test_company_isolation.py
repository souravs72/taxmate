"""Company isolation for sidebar DocTypes.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_company_isolation
"""

from __future__ import annotations

import unittest

import frappe

from taxmate.api.resource import scope_to_active_company
from taxmate.setup.company_fields import (
	OPTIONAL_COMPANY_SCOPED,
	SOFT_CUSTOM_COMPANY,
	STRICT_CUSTOM_COMPANY,
	ensure_company_link_fields,
)
from taxmate.utils.company import company_scoped, set_active_company, soft_company_scoped


SIDEBAR_DOCTYPES = (
	"Customer",
	"Supplier",
	"Sales Order",
	"Quotation",
	"Delivery Note",
	"Installation Note",
	"Sales Invoice",
	"Payment Entry",
	"Payment Request",
	"Lead",
	"Opportunity",
	"Supplier Quotation",
	"Request for Quotation",
	"Purchase Order",
	"Purchase Receipt",
	"Purchase Invoice",
	"Stock Entry",
	"Stock Reconciliation",
	"Material Request",
	"Shipment",
	"Delivery Trip",
	"Serial No",
	"Batch",
	"Landed Cost Voucher",
	"BOM",
	"Work Order",
	"Pick List",
	"Journal Entry",
	"Bank Account",
	"Mode of Payment",
	"Account",
	"Cost Center",
	"Period Closing Voucher",
	"Item",
	"Item Group",
	"Brand",
	"Warehouse",
	"Price List",
	"Payment Terms Template",
	"Sales Taxes and Charges Template",
	"Tax Category",
	"Item Tax Template",
	"Pricing Rule",
	"Customer Group",
	"Supplier Group",
	"Territory",
	"Address",
	"Contact",
	"Terms and Conditions",
	"UAE Related Party",
	"UAE VAT Group",
	"UAE Bad Debt Relief",
	"UAE Customs Declaration",
	"UAE Capital Goods Adjustment",
	"POS Invoice",
	"POS Profile",
	"Loyalty Program",
	"Loyalty Point Entry",
	"Asset",
	"Asset Category",
	"Workflow",
	"Driver",
	"Vehicle",
)

# Intentionally global (ERPNext shared reference data).
SHARED_OK = frozenset({"UOM", "Fiscal Year", "Currency Exchange"})


class TestSidebarCompanyScope(unittest.TestCase):
	@classmethod
	def setUpClass(cls):
		frappe.set_user("Administrator")
		ensure_company_link_fields()
		frappe.db.commit()

	def test_sidebar_doctypes_are_scoped(self):
		for dt in SIDEBAR_DOCTYPES:
			if not frappe.db.exists("DocType", dt):
				continue
			self.assertTrue(company_scoped(dt), f"{dt} must be company_scoped")

	def test_shared_globals_remain_unscoped(self):
		for dt in SHARED_OK:
			if frappe.db.exists("DocType", dt):
				self.assertFalse(company_scoped(dt), f"{dt} should stay shared")

	def test_strict_and_soft_sets(self):
		for dt in STRICT_CUSTOM_COMPANY:
			self.assertTrue(company_scoped(dt))
			self.assertFalse(soft_company_scoped(dt))
		for dt in SOFT_CUSTOM_COMPANY:
			self.assertTrue(soft_company_scoped(dt))
		for dt in OPTIONAL_COMPANY_SCOPED:
			self.assertTrue(company_scoped(dt))

	def test_address_scope_strict(self):
		companies = frappe.get_all("Company", pluck="name", limit=1)
		if not companies:
			self.skipTest("no company")
		set_active_company(companies[0])
		filters, _or = scope_to_active_company("Address", None)
		self.assertEqual(filters, [["custom_company", "=", companies[0]]])

	def test_item_scope_soft(self):
		companies = frappe.get_all("Company", pluck="name", limit=1)
		if not companies:
			self.skipTest("no company")
		set_active_company(companies[0])
		_filters, or_filters = scope_to_active_company("Item", None)
		self.assertTrue(or_filters)
		self.assertEqual(or_filters[0], ["custom_company", "=", companies[0]])

	def test_uae_vat_group_scoped(self):
		self.assertTrue(company_scoped("UAE VAT Group"))
		companies = frappe.get_all("Company", pluck="name", limit=1)
		if not companies:
			self.skipTest("no company")
		set_active_company(companies[0])
		filters, _ = scope_to_active_company("UAE VAT Group", None)
		self.assertEqual(filters, [["representative_company", "=", companies[0]]])

	def test_shipment_scoped_via_pickup_company(self):
		self.assertTrue(company_scoped("Shipment"))
		companies = frappe.get_all("Company", pluck="name", limit=1)
		if not companies:
			self.skipTest("no company")
		set_active_company(companies[0])
		_filters, or_filters = scope_to_active_company("Shipment", None)
		self.assertEqual(or_filters[0], ["pickup_company", "=", companies[0]])
