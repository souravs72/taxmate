"""Item UAE Item Type — Desk / ERPNext fixture insert.

TaxMate's Custom Field ``uae_item_type`` is reqd. ERPNext fixtures, POS seed,
and Desk ``New Item`` insert without it. These tests lock the before_validate
fill so ``_validate_mandatory`` does not raise MandatoryError.

Uses unittest.TestCase (not FrappeTestCase) so ERPNext Company test-record
bootstrap is not required for the unit cases.
"""

from __future__ import annotations

import unittest

from taxmate.uae_e_invoicing.constants import ITEM_TYPE_GOODS, ITEM_TYPE_SERVICE
from taxmate.uae_vat.overrides.item import before_validate

try:
	import frappe
	from frappe.utils import random_string
except Exception:  # pragma: no cover
	frappe = None
	random_string = None


class _Item:
	def __init__(self, **kwargs):
		self.__dict__.update(kwargs)

	def get(self, key):
		return getattr(self, key, None)


class TestItemUaeTypeStamp(unittest.TestCase):
	def test_stock_item_defaults_goods(self):
		doc = _Item(uae_item_type=None, is_stock_item=1)
		before_validate(doc)
		self.assertEqual(doc.uae_item_type, ITEM_TYPE_GOODS)

	def test_non_stock_item_defaults_service(self):
		doc = _Item(uae_item_type=None, is_stock_item=0)
		before_validate(doc)
		self.assertEqual(doc.uae_item_type, ITEM_TYPE_SERVICE)

	def test_keeps_explicit_type(self):
		doc = _Item(uae_item_type=ITEM_TYPE_SERVICE, is_stock_item=1)
		before_validate(doc)
		self.assertEqual(doc.uae_item_type, ITEM_TYPE_SERVICE)


class TestItemUaeTypeInsert(unittest.TestCase):
	def _site(self):
		if frappe is None or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		if not frappe.get_meta("Item").has_field("uae_item_type"):
			self.skipTest("uae_item_type is not installed")
		return frappe

	def test_erpnext_fixture_insert_without_type(self):
		self._site()
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
		code = f"TM-ITT-{random_string(6)}"
		doc = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": code,
				"item_group": group,
				"stock_uom": "Nos",
				"is_stock_item": 1,
				"is_sales_item": 1,
			}
		)
		doc.flags.ignore_permissions = True
		doc.insert(ignore_permissions=True)
		self.addCleanup(
			lambda: frappe.delete_doc("Item", code, force=True, ignore_permissions=True)
		)
		self.assertEqual(doc.uae_item_type, ITEM_TYPE_GOODS)
		self.assertEqual(frappe.db.get_value("Item", code, "uae_item_type"), ITEM_TYPE_GOODS)

	def test_ignore_validate_insert_stamps_service(self):
		self._site()
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
		code = f"TM-ITS-{random_string(6)}"
		doc = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_name": code,
				"item_group": group,
				"stock_uom": "Nos",
				"is_stock_item": 0,
				"is_sales_item": 1,
			}
		)
		doc.flags.ignore_permissions = True
		doc.flags.ignore_validate = True
		doc.insert(ignore_permissions=True)
		self.addCleanup(
			lambda: frappe.delete_doc("Item", code, force=True, ignore_permissions=True)
		)
		self.assertEqual(doc.uae_item_type, ITEM_TYPE_SERVICE)
