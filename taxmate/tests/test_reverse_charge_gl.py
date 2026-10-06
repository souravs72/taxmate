"""Reverse-charge Purchase Invoice must submit when System Settings country is empty.

ERPNext drops VAT from the supplier total using the company country, then posts
the offsetting VAT credit only when erpnext.get_region() is United Arab Emirates.
That region defaults to System Settings country. TaxMate sets frappe.flags.company
from the invoice so the stock UAE ledger override still runs.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_reverse_charge_gl
"""

from __future__ import annotations

import frappe
from frappe.core.doctype.system_settings.system_settings import clear_system_settings_cache
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt


class TestReverseChargePurchaseInvoice(FrappeTestCase):
	def test_install_sets_blank_system_country_only(self):
		"""after_install on a new site fills an empty country and keeps a chosen one."""
		from taxmate.uae.setup import ensure_uae_system_country

		previous = frappe.db.get_single_value("System Settings", "country")
		previous_default = frappe.db.get_default("country")
		try:
			frappe.db.set_single_value("System Settings", "country", "")
			frappe.local.system_settings = None
			clear_system_settings_cache()
			self.assertTrue(ensure_uae_system_country())
			self.assertEqual(frappe.get_system_settings("country"), "United Arab Emirates")
			self.assertEqual(frappe.db.get_default("country"), "United Arab Emirates")
			self.assertFalse(ensure_uae_system_country())

			frappe.db.set_single_value("System Settings", "country", "India")
			frappe.local.system_settings = None
			clear_system_settings_cache()
			self.assertFalse(ensure_uae_system_country())
			self.assertEqual(frappe.get_system_settings("country"), "India")
		finally:
			frappe.db.set_single_value("System Settings", "country", previous or "")
			if previous_default:
				frappe.db.set_default("country", previous_default)
			else:
				frappe.defaults.clear_default("country", parent="__default")
			frappe.local.system_settings = None
			clear_system_settings_cache()

	def test_submit_balances_when_system_country_is_empty(self):
		company = frappe.db.get_value("Company", {"country": "United Arab Emirates"}, "name")
		supplier = frappe.db.get_value("Supplier", {"disabled": 0}, "name")
		item = frappe.db.get_value(
			"Item", {"disabled": 0, "is_stock_item": 0, "is_fixed_asset": 0}, "name"
		)
		template = (
			frappe.db.get_value(
				"Purchase Taxes and Charges Template",
				{"company": company, "title": "UAE VAT 5%"},
				"name",
			)
			if company
			else None
		)
		if not (company and supplier and item and template):
			self.skipTest("UAE company, supplier, service item, or VAT 5% purchase template missing")

		previous_country = frappe.db.get_single_value("System Settings", "country")
		previous_flag_country = frappe.flags.country
		previous_flag_company = frappe.flags.company
		frappe.db.set_single_value("System Settings", "country", "")
		frappe.local.system_settings = None
		clear_system_settings_cache()
		frappe.flags.country = None
		frappe.flags.company = None
		try:
			expense = frappe.db.get_value("Company", company, "default_expense_account")
			cost_center = frappe.db.get_value("Company", company, "cost_center")
			doc = frappe.new_doc("Purchase Invoice")
			doc.company = company
			doc.supplier = supplier
			doc.posting_date = frappe.utils.today()
			doc.set_posting_time = 1
			doc.update_stock = 0
			doc.reverse_charge = "Y"
			doc.recoverable_reverse_charge = 100
			doc.bill_no = f"TM-RCM-{frappe.generate_hash(length=8)}"
			doc.bill_date = doc.posting_date
			doc.taxes_and_charges = template
			doc.append(
				"items",
				{
					"item_code": item,
					"qty": 1,
					"rate": 1000,
					"expense_account": expense,
					"cost_center": cost_center,
				},
			)
			from erpnext.controllers.accounts_controller import get_taxes_and_charges

			for row in get_taxes_and_charges("Purchase Taxes and Charges Template", template):
				doc.append("taxes", row)
			doc.insert()

			self.assertEqual(flt(doc.net_total), 1000)
			self.assertEqual(flt(doc.grand_total), 1000)

			entries = doc.get_gl_entries()
			debit = sum(flt(entry.debit) for entry in entries)
			credit = sum(flt(entry.credit) for entry in entries)
			self.assertEqual(debit, credit)
			self.assertGreater(debit, 0)

			vat = flt(doc.taxes[0].base_tax_amount_after_discount_amount)
			self.assertEqual(vat, 50)
			filters = {"company": company, "from_date": doc.posting_date, "to_date": doc.posting_date}
			from taxmate.uae_vat.utils.vat_201 import (
				_reverse_charge_output,
				_reverse_charge_recoverable_input,
			)

			box_3_before = _reverse_charge_output(filters)["vat_amount"]
			box_10_before = _reverse_charge_recoverable_input(filters)["vat_amount"]

			doc.submit()
			self.assertEqual(doc.docstatus, 1)
			self.assertEqual(_reverse_charge_output(filters)["vat_amount"] - box_3_before, vat)
			self.assertEqual(_reverse_charge_recoverable_input(filters)["vat_amount"] - box_10_before, vat)
		finally:
			frappe.flags.country = previous_flag_country
			frappe.flags.company = previous_flag_company
			frappe.db.set_single_value("System Settings", "country", previous_country or "")
			frappe.local.system_settings = None
			clear_system_settings_cache()
