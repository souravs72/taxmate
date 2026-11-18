"""Item Tax Template UAE VAT Category — Desk company create.

ERPNext seeds Item Tax Templates on Company.insert without TaxMate's required
``uae_vat_category``. These tests lock the before_validate fill so Desk
``New Company`` does not raise MandatoryError.

Uses unittest.TestCase (not FrappeTestCase) so ERPNext Company test-record
bootstrap does not pull Item.uae_item_type, which is a separate required field.
"""

from __future__ import annotations

import unittest

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae.setup import vat_category_for_item_tax_title
from taxmate.uae_vat.overrides.item_tax_template import before_validate

try:
	import frappe
	from frappe.utils import random_string
except Exception:  # pragma: no cover
	frappe = None
	random_string = None


def _uae_company() -> str | None:
	return frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")


def _tax_account(company: str) -> str | None:
	return frappe.db.get_value(
		"Account",
		{"company": company, "account_type": "Tax", "is_group": 0},
		"name",
	) or frappe.db.get_value(
		"Account",
		{"company": company, "account_name": "VAT 5%", "is_group": 0},
		"name",
	)


class TestItemTaxTitleCategory(unittest.TestCase):
	def test_erpnext_uae_seed_titles(self):
		self.assertEqual(vat_category_for_item_tax_title("UAE VAT 5%"), "Standard")
		self.assertEqual(vat_category_for_item_tax_title("UAE VAT Zero"), "Zero Rated")
		self.assertEqual(vat_category_for_item_tax_title("UAE VAT Exempted"), "Exempt")
		self.assertEqual(vat_category_for_item_tax_title("UAE Excise 50%"), "Out of Scope")
		self.assertEqual(vat_category_for_item_tax_title("UAE VAT 5% - LM"), "Standard")
		self.assertIsNone(vat_category_for_item_tax_title("Custom VAT"))


class TestItemTaxTemplateVatCategory(unittest.TestCase):
	def _site(self):
		if frappe is None or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		return frappe

	def test_before_validate_stamps_standard_from_title(self):
		self._site()
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company")
		doc = frappe.new_doc("Item Tax Template")
		doc.title = "UAE VAT 5%"
		doc.company = company
		before_validate(doc)
		self.assertEqual(doc.uae_vat_category, "Standard")

	def test_before_validate_maps_zero_over_default(self):
		self._site()
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company")
		doc = frappe.new_doc("Item Tax Template")
		doc.title = "UAE VAT Zero"
		doc.company = company
		doc.uae_vat_category = "Standard"
		before_validate(doc)
		self.assertEqual(doc.uae_vat_category, "Zero Rated")

	def test_erpnext_seed_insert_does_not_raise_mandatory(self):
		"""Match taxes_setup.make_item_tax_template flags (ignore_validate, no category)."""
		self._site()
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company")
		account = _tax_account(company)
		if not account:
			self.skipTest("No tax account")
		title = f"UAE VAT 5% - {random_string(6)}"
		doc = frappe.get_doc(
			{
				"doctype": "Item Tax Template",
				"title": title,
				"company": company,
				"taxes": [{"tax_type": account, "tax_rate": 5}],
			}
		)
		doc.flags.ignore_links = True
		doc.flags.ignore_validate = True
		doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
		self.addCleanup(
			lambda: frappe.delete_doc(
				"Item Tax Template", doc.name, force=True, ignore_permissions=True
			)
		)
		self.assertEqual(doc.uae_vat_category, "Standard")
		self.assertEqual(
			frappe.db.get_value("Item Tax Template", doc.name, "uae_vat_category"),
			"Standard",
		)

	def test_erpnext_fixture_insert_without_ignore_validate(self):
		"""ERPNext test records insert Item Tax Templates with no UAE category."""
		self._site()
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company")
		account = _tax_account(company)
		if not account:
			self.skipTest("No tax account")
		title = f"_Test Fixture VAT {random_string(6)}"
		doc = frappe.get_doc(
			{
				"doctype": "Item Tax Template",
				"title": title,
				"company": company,
				"taxes": [{"tax_type": account, "tax_rate": 10}],
			}
		)
		doc.insert(ignore_permissions=True)
		self.addCleanup(
			lambda: frappe.delete_doc(
				"Item Tax Template", doc.name, force=True, ignore_permissions=True
			)
		)
		self.assertEqual(doc.uae_vat_category, "Standard")

	def test_make_item_tax_template_stamps_zero_rated(self):
		"""ERPNext Company.on_update calls this; it used to MandatoryError."""
		self._site()
		from erpnext.setup.setup_wizard.operations.taxes_setup import make_item_tax_template

		company = _uae_company()
		if not company:
			self.skipTest("No UAE company")
		template = {
			"title": f"UAE VAT Zero - {random_string(6)}",
			"taxes": [
				{
					"tax_type": {
						"account_name": "VAT Zero",
						"tax_rate": 0.0,
					}
				}
			],
		}
		doc = make_item_tax_template(company, template)
		if not doc:
			self.skipTest("Template already existed")
		self.addCleanup(
			lambda: frappe.delete_doc(
				"Item Tax Template", doc.name, force=True, ignore_permissions=True
			)
		)
		self.assertEqual(doc.uae_vat_category, "Zero Rated")
