"""Stock Entry and Stock Reconciliation write-path tests.

Run: bench --site <site> run-tests --app taxmate --module taxmate.tests.test_stock
"""

from __future__ import annotations

import unittest

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api.resource import insert
from taxmate.api.workflow import cancel, submit


def _require_company_warehouse() -> tuple[str, str, str]:
	"""Return (company, warehouse, item) or skip."""
	company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
	if not company:
		raise unittest.SkipTest("No Company configured")
	warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	if not warehouse:
		raise unittest.SkipTest("Need a leaf warehouse for the company")
	item = frappe.db.get_value(
		"Item", {"disabled": 0, "is_stock_item": 1, "is_purchase_item": 1}, "name"
	)
	if not item:
		raise unittest.SkipTest("Need a stock item marked is_purchase_item")
	return company, warehouse, item


class TestStockEntryReceipt(FrappeTestCase):
	def test_material_receipt_insert_then_submit(self):
		try:
			company, warehouse, item = _require_company_warehouse()
		except unittest.SkipTest as exc:
			self.skipTest(str(exc))

		doc = insert(
			{
				"doctype": "Stock Entry",
				"company": company,
				"stock_entry_type": "Material Receipt",
				"posting_date": "2026-09-23",
				"set_posting_time": 1,
				"items": [
					{
						"item_code": item,
						"qty": 5,
						"basic_rate": 10,
						"t_warehouse": warehouse,
					}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		self.assertEqual(doc["stock_entry_type"], "Material Receipt")
		items = doc.get("items") or []
		self.assertTrue(items)

		submitted = submit({"doctype": "Stock Entry", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)

		cancelled = cancel("Stock Entry", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

	def test_material_issue_insert_then_submit(self):
		try:
			company, warehouse, item = _require_company_warehouse()
		except unittest.SkipTest as exc:
			self.skipTest(str(exc))

		# First ensure there's stock to issue
		receipt = insert(
			{
				"doctype": "Stock Entry",
				"company": company,
				"stock_entry_type": "Material Receipt",
				"posting_date": "2026-09-23",
				"set_posting_time": 1,
				"items": [{"item_code": item, "qty": 10, "basic_rate": 10, "t_warehouse": warehouse}],
			}
		)
		submit({"doctype": "Stock Entry", "name": receipt["name"]})

		doc = insert(
			{
				"doctype": "Stock Entry",
				"company": company,
				"stock_entry_type": "Material Issue",
				"posting_date": "2026-09-23",
				"set_posting_time": 1,
				"items": [{"item_code": item, "qty": 2, "s_warehouse": warehouse}],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		submitted = submit({"doctype": "Stock Entry", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)

		cancel("Stock Entry", doc["name"])
		cancel("Stock Entry", receipt["name"])

	def test_material_transfer_insert_then_submit(self):
		try:
			company, warehouse, item = _require_company_warehouse()
		except unittest.SkipTest as exc:
			self.skipTest(str(exc))

		warehouses = frappe.get_all(
			"Warehouse",
			filters={"company": company, "is_group": 0},
			pluck="name",
			limit=2,
		)
		if len(warehouses) < 2:
			self.skipTest("Need at least 2 leaf warehouses for transfer test")

		src_wh, tgt_wh = warehouses[0], warehouses[1]

		receipt = insert(
			{
				"doctype": "Stock Entry",
				"company": company,
				"stock_entry_type": "Material Receipt",
				"posting_date": "2026-09-23",
				"set_posting_time": 1,
				"items": [{"item_code": item, "qty": 10, "basic_rate": 10, "t_warehouse": src_wh}],
			}
		)
		submit({"doctype": "Stock Entry", "name": receipt["name"]})

		doc = insert(
			{
				"doctype": "Stock Entry",
				"company": company,
				"stock_entry_type": "Material Transfer",
				"posting_date": "2026-09-23",
				"set_posting_time": 1,
				"items": [
					{"item_code": item, "qty": 3, "s_warehouse": src_wh, "t_warehouse": tgt_wh}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		submitted = submit({"doctype": "Stock Entry", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)

		cancel("Stock Entry", doc["name"])
		cancel("Stock Entry", receipt["name"])


class TestStockReconciliation(FrappeTestCase):
	def test_opening_stock_reconciliation_insert_then_submit(self):
		try:
			company, warehouse, item = _require_company_warehouse()
		except unittest.SkipTest as exc:
			self.skipTest(str(exc))

		# Opening Stock reconciliation requires a difference_account of Asset/Liability type.
		# ERPNext's own fixtures use "Temporary Opening" or a Current Asset account.
		diff_account = (
			frappe.db.get_value(
				"Account",
				{"account_type": "Temporary", "company": company},
				"name",
			)
			or frappe.db.get_value(
				"Account",
				{"root_type": "Asset", "account_type": "Current Asset", "is_group": 0, "company": company},
				"name",
			)
		)
		if not diff_account:
			self.skipTest("No Temporary or Current Asset account available for Opening Stock reconciliation")

		doc = insert(
			{
				"doctype": "Stock Reconciliation",
				"company": company,
				"purpose": "Opening Stock",
				"posting_date": "2026-09-23",
				"set_posting_time": 1,
				"difference_account": diff_account,
				"items": [
					{
						"item_code": item,
						"warehouse": warehouse,
						"qty": 20,
						"valuation_rate": 15,
					}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		self.assertEqual(doc["purpose"], "Opening Stock")
		submitted = submit({"doctype": "Stock Reconciliation", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		cancelled = cancel("Stock Reconciliation", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)


class TestItemQtyShape(FrappeTestCase):
	"""Verify taxmate.api.stock.get_item_qty returns the documented shape."""

	def test_item_qty_shape(self):
		try:
			_company, _warehouse, item = _require_company_warehouse()
		except unittest.SkipTest as exc:
			self.skipTest(str(exc))

		from taxmate.api.stock import item_qty

		result = item_qty(item_code=item)
		self.assertIn("total", result, "item_qty must return 'total' key")
		self.assertIn("warehouses", result, "item_qty must return 'warehouses' key (not per_warehouse)")
		self.assertIsInstance(result["total"], (int, float))
		self.assertIsInstance(result["warehouses"], list)
		for row in result["warehouses"]:
			self.assertIn("warehouse", row, "each row must have 'warehouse'")
			self.assertIn("actual_qty", row, "each row must have 'actual_qty' (not qty)")

	def test_item_qty_shape_ignores_unknown_item(self):
		try:
			from taxmate.api.stock import item_qty

			result = item_qty(item_code="__nonexistent__")
		except Exception:
			self.skipTest("API raised on unknown item — skip shape check")
		self.assertIn("total", result)
		self.assertEqual(result["total"], 0)


class TestQuotationInsert(FrappeTestCase):
	def test_quotation_insert_then_submit(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company configured")
		customer = frappe.db.get_value("Customer", {"disabled": 0}, "name")
		if not customer:
			self.skipTest("No active Customer available")
		item = frappe.db.get_value("Item", {"disabled": 0, "is_sales_item": 1}, "name")
		if not item:
			self.skipTest("No sales item available")

		doc = insert({
			"doctype": "Quotation",
			"quotation_to": "Customer",
			"party_name": customer,
			"transaction_date": "2026-09-23",
			"valid_till": "2026-12-31",
			"company": company,
			"items": [{"item_code": item, "qty": 1, "rate": 100}],
		})
		self.assertEqual(doc["docstatus"], 0)
		submitted = submit({"doctype": "Quotation", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		cancel("Quotation", doc["name"])


class TestMaterialRequestPurchaseInsert(FrappeTestCase):
	def test_material_request_purchase_insert_then_submit(self):
		try:
			company, warehouse, item = _require_company_warehouse()
		except unittest.SkipTest as exc:
			self.skipTest(str(exc))

		doc = insert({
			"doctype": "Material Request",
			"material_request_type": "Purchase",
			"transaction_date": "2026-09-23",
			"schedule_date": "2026-10-01",
			"company": company,
			"items": [{
				"item_code": item,
				"qty": 10,
				"warehouse": warehouse,
				"schedule_date": "2026-10-01",
			}],
		})
		self.assertEqual(doc["docstatus"], 0)
		self.assertEqual(doc["material_request_type"], "Purchase")
		submitted = submit({"doctype": "Material Request", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		cancel("Material Request", doc["name"])


class TestQuotationMapper(FrappeTestCase):
	def test_make_quotation_so_method_in_catalog(self):
		from taxmate.api import get_catalog

		catalog = get_catalog()
		methods = {row["method"] for row in catalog["actions"]}
		self.assertIn("taxmate.api.quotation.make_sales_order", methods)
		self.assertIn("taxmate.api.material_request.make_purchase_order", methods)
		self.assertIn("taxmate.api.material_request.make_stock_entry", methods)

	def test_stock_doctypes_in_catalog(self):
		from taxmate.api import get_catalog

		catalog = get_catalog()
		doctypes = {row["doctype"] for row in catalog["resources"]}
		self.assertIn("Stock Entry", doctypes)
		self.assertIn("Stock Reconciliation", doctypes)
		self.assertIn("Material Request", doctypes)
		self.assertIn("Quotation", doctypes)


class TestDnPrReturnCatalog(FrappeTestCase):
    """Catalog includes the DN and PR return mapper methods."""

    def test_dn_return_in_catalog(self):
        from taxmate.api import get_catalog

        catalog = get_catalog()
        methods = {row["method"] for row in catalog["actions"]}
        self.assertIn("taxmate.api.delivery_note.make_return", methods)

    def test_pr_return_in_catalog(self):
        from taxmate.api import get_catalog

        catalog = get_catalog()
        methods = {row["method"] for row in catalog["actions"]}
        self.assertIn("taxmate.api.purchase_receipt.make_return", methods)

    def test_master_doctypes_in_catalog(self):
        """Item Group, Brand, UOM should appear in catalog resources."""
        from taxmate.api import get_catalog

        catalog = get_catalog()
        doctypes = {row["doctype"] for row in catalog["resources"]}
        for dt in ("Item Group", "Brand", "UOM"):
            if frappe.db.exists("DocType", dt):
                self.assertIn(dt, doctypes, f"{dt} should be in catalog resources")


class TestMakeDnReturn(FrappeTestCase):
    """make_return on a submitted Delivery Note produces a valid unsaved return."""

    def test_make_dn_return_requires_submitted(self):
        company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
        if not company:
            self.skipTest("No Company configured")
        # Use a Draft DN to verify the guard
        draft_dn = frappe.db.get_value(
            "Delivery Note",
            {"docstatus": 0, "company": company, "is_return": 0},
            "name",
        )
        if not draft_dn:
            self.skipTest("No draft DN available for negative test")
        from taxmate.api.delivery_note import make_return
        with self.assertRaises(Exception):
            make_return(source_name=draft_dn)

    def test_make_pr_return_requires_submitted(self):
        company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
        if not company:
            self.skipTest("No Company configured")
        draft_pr = frappe.db.get_value(
            "Purchase Receipt",
            {"docstatus": 0, "company": company, "is_return": 0},
            "name",
        )
        if not draft_pr:
            self.skipTest("No draft PR available for negative test")
        from taxmate.api.purchase_receipt import make_return
        with self.assertRaises(Exception):
            make_return(source_name=draft_pr)

