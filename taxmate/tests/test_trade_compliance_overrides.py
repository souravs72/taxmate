"""Unit tests for UAE compliance hooks across upstream trade documents."""

import unittest
from unittest.mock import MagicMock, patch

import frappe
from frappe.utils import getdate

from taxmate.uae_vat.utils.place_of_supply import (
	purchase_order_zone_guidance,
	sales_order_zone_guidance,
	validate_delivery_note,
	validate_purchase_order,
	validate_quotation,
	validate_sales_order,
)


class TestTradeComplianceOverrides(unittest.TestCase):
	@patch("taxmate.uae_vat.utils.place_of_supply._is_uae_company", return_value=True)
	@patch("taxmate.uae_vat.utils.place_of_supply._resolve_company_emirate", return_value="Dubai")
	def test_quotation_resolves_emirate(self, mock_resolve, mock_is_uae):
		doc = frappe._dict(doctype="Quotation", company="Test Co", vat_emirate=None)
		validate_quotation(doc)
		self.assertEqual(doc.vat_emirate, "Dubai")

	@patch("taxmate.uae_vat.utils.place_of_supply._is_uae_company", return_value=True)
	@patch("taxmate.uae_vat.utils.place_of_supply._resolve_company_emirate", return_value="Abu Dhabi")
	def test_delivery_note_resolves_emirate(self, mock_resolve, mock_is_uae):
		doc = frappe._dict(doctype="Delivery Note", company="Test Co", vat_emirate=None)
		validate_delivery_note(doc, on_submit=False)
		self.assertEqual(doc.vat_emirate, "Abu Dhabi")

	@patch("taxmate.uae_vat.utils.place_of_supply._is_uae_company", return_value=True)
	@patch("taxmate.uae_vat.utils.place_of_supply._resolve_company_emirate", return_value=None)
	def test_delivery_note_throws_on_submit_if_no_emirate(self, mock_resolve, mock_is_uae):
		doc = frappe._dict(doctype="Delivery Note", company="Test Co", vat_emirate=None)
		with self.assertRaises(frappe.ValidationError):
			validate_delivery_note(doc, on_submit=True)

	@patch("taxmate.uae_vat.utils.place_of_supply._is_uae_company", return_value=True)
	@patch("taxmate.uae_vat.utils.place_of_supply._resolve_company_emirate", return_value="Sharjah")
	def test_purchase_order_resolves_emirate(self, mock_resolve, mock_is_uae):
		doc = frappe._dict(doctype="Purchase Order", company="Test Co", vat_emirate=None)
		validate_purchase_order(doc, on_submit=False)
		self.assertEqual(doc.vat_emirate, "Sharjah")

	@patch("taxmate.uae_vat.utils.place_of_supply._zone_flag")
	def test_purchase_order_zone_guidance(self, mock_zone):
		# When both company and supplier are in designated zone
		mock_zone.side_effect = lambda dt, name: True
		doc = frappe._dict(doctype="Purchase Order", company="DZ Co", supplier="DZ Supp")
		hint = purchase_order_zone_guidance(doc)
		self.assertIsNotNone(hint)
		self.assertIn("Designated Zone", hint)
