"""TaxMate accounts API: catalog, resource CRUD, reports, dashboard.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_api
"""

from __future__ import annotations

import unittest
import uuid

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import get_catalog, get_session
from taxmate.api.dashboard import get_home
from taxmate.api.reports import list_reports
from taxmate.api.resource import delete, get, get_list, get_meta, insert, is_allowed_doctype, save


class TestApiAllowlist(unittest.TestCase):
	def test_accounts_doctypes_allowed_hr_denied(self):
		self.assertTrue(is_allowed_doctype("Sales Invoice"))
		self.assertTrue(is_allowed_doctype("Customer"))
		self.assertTrue(is_allowed_doctype("Supplier"))
		self.assertTrue(is_allowed_doctype("Purchase Invoice"))
		self.assertTrue(is_allowed_doctype("Purchase Order"))
		self.assertTrue(is_allowed_doctype("Purchase Receipt"))
		self.assertTrue(is_allowed_doctype("UAE Incoming Invoice"))
		self.assertTrue(is_allowed_doctype("UAE CT Filing Log"))
		self.assertTrue(is_allowed_doctype("UAE ESR Filing"))
		self.assertTrue(is_allowed_doctype("UAE UBO Register"))
		self.assertTrue(is_allowed_doctype("UAE Late Filing Notice"))
		self.assertTrue(is_allowed_doctype("Journal Entry"))
		self.assertTrue(is_allowed_doctype("Account"))
		self.assertTrue(is_allowed_doctype("Warehouse"))
		self.assertTrue(is_allowed_doctype("Buying Settings"))
		self.assertTrue(is_allowed_doctype("ToDo"))
		self.assertFalse(is_allowed_doctype("Employee"))
		self.assertFalse(is_allowed_doctype(""))


class TestApiCatalog(FrappeTestCase):
	def test_catalog_lists_accounts_resources_and_actions(self):
		catalog = get_catalog()
		doctypes = {row["doctype"] for row in catalog["resources"]}
		self.assertIn("Sales Invoice", doctypes)
		self.assertIn("Purchase Invoice", doctypes)
		self.assertIn("Purchase Order", doctypes)
		self.assertIn("Purchase Receipt", doctypes)
		self.assertIn("Payment Entry", doctypes)
		self.assertIn("Journal Entry", doctypes)
		self.assertIn("Customer", doctypes)
		self.assertIn("Supplier", doctypes)
		self.assertIn("Buying Settings", doctypes)
		self.assertIn("Account", doctypes)
		self.assertIn("UAE VAT 201 Filing Log", doctypes)
		self.assertIn("UAE CT Filing Log", doctypes)
		self.assertIn("UAE ESR Filing", doctypes)
		self.assertIn("UAE UBO Register", doctypes)
		self.assertIn("UAE Late Filing Notice", doctypes)
		self.assertIn("UAE Incoming Invoice", doctypes)
		self.assertNotIn("Employee", doctypes)

		methods = {row["method"] for row in catalog["actions"]}
		self.assertIn("taxmate.api.resource.get_list", methods)
		self.assertIn("taxmate.api.workflow.submit", methods)
		self.assertIn("taxmate.api.accounts.get_party_details", methods)
		self.assertIn("taxmate.api.sales_order.fulfilment_summary", methods)
		self.assertIn("taxmate.api.search.awesome", methods)
		self.assertIn("taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice", methods)
		self.assertIn(
			"taxmate.uae_e_invoicing.doctype.uae_incoming_invoice.uae_incoming_invoice.create_purchase_invoice",
			methods,
		)
		self.assertIn(
			"taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.get_or_create",
			methods,
		)
		self.assertIn(
			"taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.generate_filing",
			methods,
		)
		self.assertIn("taxmate.api.accounts.resolve_payment_accounts", methods)
		self.assertIn("taxmate.api.sales_order.linked_documents", methods)
		self.assertIn("taxmate.api.sales_order.make_delivery_note", methods)
		self.assertIn("taxmate.api.sales_order.make_sales_invoice", methods)
		self.assertIn("taxmate.api.purchase_order.make_purchase_receipt", methods)
		self.assertIn("taxmate.api.purchase_order.make_purchase_invoice", methods)
		self.assertIn("taxmate.api.resource.group_by_count", methods)
		self.assertFalse(any("rest" in row for row in catalog["resources"]))
		self.assertFalse(is_allowed_doctype("User"))
		self.assertFalse(is_allowed_doctype("Data Import"))
		self.assertFalse(is_allowed_doctype("System Settings"))

		reports = {row["report"] for row in catalog["reports"]}
		self.assertIn("General Ledger", reports)
		self.assertIn("UAE VAT 201", reports)

	def test_session_returns_user(self):
		session = get_session()
		self.assertEqual(session["user"], frappe.session.user)
		self.assertIn("company", session)
		self.assertIn("roles", session)
		self.assertTrue(session["roles"])
		self.assertIn(session.get("spa_role"), ("owner", "accountant", "clerk", "viewer"))


class TestApiResource(FrappeTestCase):
	def test_todo_crud(self):
		description = f"tm-api-{uuid.uuid4().hex[:10]}"
		created = insert({"doctype": "ToDo", "description": description, "status": "Open"})
		self.assertTrue(created.get("name"))

		fetched = get("ToDo", created["name"])
		self.assertEqual(fetched["description"], description)

		rows = get_list("ToDo", filters={"name": created["name"]}, fields=["name", "description"])
		self.assertEqual(len(rows), 1)

		fetched["status"] = "Closed"
		saved = save(fetched)
		self.assertEqual(saved["status"], "Closed")

		delete("ToDo", created["name"])
		self.assertFalse(frappe.db.exists("ToDo", created["name"]))

	def test_denied_doctype_raises(self):
		with self.assertRaises(frappe.PermissionError):
			get_list("Employee")
		self.assertFalse(is_allowed_doctype("Sales Invoice Item"))
		with self.assertRaises(frappe.PermissionError):
			get_list("Sales Invoice Item", parent="Sales Invoice")

	def test_meta_includes_fields(self):
		meta = get_meta("Customer")
		self.assertEqual(meta["name"], "Customer")
		fieldnames = {row["fieldname"] for row in meta["fields"]}
		self.assertIn("customer_name", fieldnames)

	def test_meta_marks_submittable_vouchers(self):
		self.assertFalse(get_meta("ToDo")["is_submittable"])
		self.assertTrue(get_meta("Sales Invoice")["is_submittable"])

	def test_meta_nests_child_table_fields(self):
		meta = get_meta("Sales Invoice")
		items = next(row for row in meta["fields"] if row["fieldname"] == "items")
		self.assertEqual(items["fieldtype"], "Table")
		self.assertEqual(items["options"], "Sales Invoice Item")
		child_names = {row["fieldname"] for row in items["fields"]}
		self.assertIn("item_code", child_names)
		self.assertIn("qty", child_names)

	def test_guest_catalog_requires_login(self):
		frappe.set_user("Guest")
		try:
			with self.assertRaises(frappe.AuthenticationError):
				get_catalog()
			with self.assertRaises(frappe.AuthenticationError):
				get_home()
			with self.assertRaises(frappe.AuthenticationError):
				list_reports()
			from taxmate.api.search import awesome

			with self.assertRaises(frappe.AuthenticationError):
				awesome(text="invoice")
			with self.assertRaises(frappe.AuthenticationError):
				get_list("ToDo")
		finally:
			frappe.set_user("Administrator")

	def test_group_by_count_and_or_filters_count(self):
		from taxmate.api.resource import get_count, group_by_count

		counts = group_by_count("ToDo", current_filters=[], field="status")
		self.assertIsInstance(counts, list)
		n = get_count("ToDo", filters={"status": "Open"}, or_filters=[["status", "=", "Closed"]])
		self.assertGreaterEqual(int(n or 0), 0)

	def test_restricted_user_cannot_list_invoices(self):
		email = f"tm-api-{uuid.uuid4().hex[:8]}@example.com"
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "API Restricted",
				"send_welcome_email": 0,
				"user_type": "Website User",
			}
		).insert(ignore_permissions=True)
		frappe.set_user(email)
		try:
			with self.assertRaises(frappe.PermissionError):
				get_list("Sales Invoice")
		finally:
			frappe.set_user("Administrator")


class TestApiReportsAndHome(FrappeTestCase):
	def test_list_reports_includes_core_books(self):
		reports = {row["report"] for row in list_reports()}
		self.assertIn("Balance Sheet", reports)
		self.assertIn("Trial Balance", reports)
		self.assertIn("Accounts Receivable", reports)
		self.assertIn("Accounts Payable", reports)

	def test_home_kpis_shape(self):
		home = get_home()
		self.assertIn("kpis", home)
		names = {row["name"] for row in home["kpis"]}
		self.assertIn("Draft Sales Invoices", names)
		for row in home["kpis"]:
			self.assertIsInstance(row["value"], int)

	def test_home_kpis_ignore_form_dict_company(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		frappe.form_dict.company = company
		try:
			home = get_home(company=company)
			self.assertIn("kpis", home)
			for row in home["kpis"]:
				self.assertIsInstance(row["value"], int)
		finally:
			frappe.form_dict.pop("company", None)

	def test_trial_balance_runs(self):
		from taxmate.api.reports import run_report

		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		fiscal_year = frappe.db.get_value("Fiscal Year", {"disabled": 0}, "name")
		if not fiscal_year:
			self.skipTest("No Fiscal Year")
		result = run_report(
			"Trial Balance",
			{
				"company": company,
				"fiscal_year": fiscal_year,
				"from_date": "2026-01-01",
				"to_date": "2026-12-31",
			},
		)
		self.assertIn("result", result)

	def test_profit_and_loss_runs_with_date_range_filters(self):
		from taxmate.api.reports import run_report

		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		fiscal_year = frappe.db.get_value("Fiscal Year", {"disabled": 0}, "name")
		if not fiscal_year:
			self.skipTest("No Fiscal Year")
		result = run_report(
			"Profit and Loss Statement",
			{
				"company": company,
				"filter_based_on": "Date Range",
				"periodicity": "Yearly",
				"from_fiscal_year": fiscal_year,
				"to_fiscal_year": fiscal_year,
				"period_start_date": "2026-01-01",
				"period_end_date": "2026-12-31",
				"accumulated_values": 0,
			},
		)
		self.assertIn("result", result)

	def test_balance_sheet_runs_monthly(self):
		from taxmate.api.reports import run_report

		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		fiscal_year = frappe.db.get_value("Fiscal Year", {"disabled": 0}, "name")
		if not fiscal_year:
			self.skipTest("No Fiscal Year")
		result = run_report(
			"Balance Sheet",
			{
				"company": company,
				"filter_based_on": "Date Range",
				"periodicity": "Monthly",
				"from_fiscal_year": fiscal_year,
				"to_fiscal_year": fiscal_year,
				"period_start_date": "2026-01-01",
				"period_end_date": "2026-09-22",
				"accumulated_values": 1,
			},
		)
		self.assertIn("result", result)
		columns = {col.get("fieldname") for col in result.get("columns") or [] if isinstance(col, dict)}
		self.assertTrue(any("jan" in (name or "").lower() or "2026" in (name or "") for name in columns))

	def test_uae_late_filing_status_runs_with_object_filters(self):
		from taxmate.api.reports import run_report

		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		result = run_report("UAE Late Filing Status", {"company": company})
		self.assertIn("result", result)

	def test_run_report_rejects_list_filters(self):
		from taxmate.api.reports import run_report

		with self.assertRaises(frappe.ValidationError):
			run_report("Trial Balance", [["company", "=", "X"]])


class TestApiMastersHappyPath(FrappeTestCase):
	def test_customer_insert_and_party_details(self):
		group = frappe.db.get_single_value("Selling Settings", "customer_group") or frappe.db.get_value(
			"Customer Group", {"is_group": 0}
		)
		territory = frappe.db.get_single_value("Selling Settings", "territory") or frappe.db.get_value(
			"Territory", {"is_group": 0}
		)
		if not group or not territory:
			self.skipTest("Customer Group / Territory not set up")

		name = f"TM API {uuid.uuid4().hex[:8]}"
		created = insert(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_type": "Individual",
				"customer_group": group,
				"territory": territory,
			}
		)
		self.assertTrue(frappe.db.exists("Customer", created["name"]))

		from taxmate.api.accounts import get_defaults, get_party_details

		details = get_party_details(party=created["name"], party_type="Customer")
		self.assertTrue(details)
		defaults = get_defaults()
		self.assertIn("company", defaults)

		delete("Customer", created["name"])

	def test_supplier_insert_address_contact(self):
		group = frappe.db.get_single_value("Buying Settings", "supplier_group") or frappe.db.get_value(
			"Supplier Group", {"is_group": 0}
		)
		if not group:
			self.skipTest("Supplier Group not set up")

		name = f"TM SUP {uuid.uuid4().hex[:8]}"
		created = insert(
			{
				"doctype": "Supplier",
				"supplier_name": name,
				"supplier_type": "Company",
				"supplier_group": group,
			}
		)
		supp_name = created["name"]
		self.assertTrue(frappe.db.exists("Supplier", supp_name))

		addr = insert(
			{
				"doctype": "Address",
				"address_title": name,
				"address_type": "Billing",
				"address_line1": "Street 1",
				"city": "Dubai",
				"state": "Dubai",
				"emirate": "Dubai",
				"country": "United Arab Emirates",
				"links": [{"link_doctype": "Supplier", "link_name": supp_name}],
			}
		)
		addr_doc = frappe.get_doc("Address", addr["name"])
		self.assertTrue(
			any(row.link_doctype == "Supplier" and row.link_name == supp_name for row in addr_doc.links)
		)

		contact = insert(
			{
				"doctype": "Contact",
				"first_name": name,
				"links": [{"link_doctype": "Supplier", "link_name": supp_name}],
			}
		)
		contact_doc = frappe.get_doc("Contact", contact["name"])
		self.assertTrue(
			any(row.link_doctype == "Supplier" and row.link_name == supp_name for row in contact_doc.links)
		)

		fetched = get("Supplier", supp_name)
		fetched["supplier_primary_address"] = addr["name"]
		fetched["supplier_primary_contact"] = contact["name"]
		saved = save(fetched)
		self.assertEqual(saved["supplier_primary_address"], addr["name"])
		self.assertEqual(saved["supplier_primary_contact"], contact["name"])

		frappe.delete_doc("Supplier", supp_name, force=True, ignore_permissions=True)
		frappe.delete_doc("Contact", contact["name"], force=True, ignore_permissions=True)
		frappe.delete_doc("Address", addr["name"], force=True, ignore_permissions=True)

	def test_account_tree_when_company_exists(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		from taxmate.api.accounts import get_account_tree

		tree = get_account_tree(company=company)
		self.assertTrue(tree)

	def test_item_details_when_item_exists(self):
		item = frappe.db.get_value("Item", {"disabled": 0, "is_sales_item": 1})
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not item or not company:
			self.skipTest("No Item / Company")
		from taxmate.api.accounts import get_item_details

		details = get_item_details(
			{
				"item_code": item,
				"company": company,
				"doctype": "Sales Invoice",
				"qty": 1,
			}
		)
		self.assertEqual(details.get("item_code") or item, item)
		item_doc = frappe.get_cached_doc("Item", item)
		for field in ("uae_item_type", "hs_code", "sac_code"):
			if item_doc.meta.has_field(field) and item_doc.get(field):
				self.assertEqual(details.get(field), item_doc.get(field))


class TestApiVoucherHappyPath(FrappeTestCase):
	def test_sales_invoice_submit_payment_and_cancel(self):
		from taxmate.tests.uae_prove_fixtures import (
			SERVICE_ITEM,
			WALK_IN,
			_ensure_walk_in,
			require_prove_site,
		)

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))
		_ensure_walk_in()

		from taxmate.api.accounts import get_outstanding_invoices, get_payment_entry
		from taxmate.api.workflow import cancel, submit

		doc = insert(
			{
				"doctype": "Sales Invoice",
				"company": company,
				"customer": WALK_IN,
				"posting_date": "2026-11-15",
				"due_date": "2026-11-15",
				"set_posting_time": 1,
				"currency": "AED",
				"conversion_rate": 1,
				"selling_price_list": "Standard Selling",
				"price_list_currency": "AED",
				"plc_conversion_rate": 1,
				"vat_emirate": "Dubai",
				"taxes_and_charges": "UAE VAT 5% - TM",
				"items": [
					{
						"item_code": SERVICE_ITEM,
						"qty": 1,
						"rate": 100,
						"uae_item_type": "Service",
						"sac_code": "998311",
					}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		items = doc.get("items") or []
		self.assertTrue(items)
		self.assertEqual(items[0].get("sac_code"), "998311")

		submitted = submit({"doctype": "Sales Invoice", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)

		from taxmate.api.accounts import make_sales_return

		credit = make_sales_return(doc["name"])
		self.assertTrue(credit.get("is_return"))
		self.assertEqual(credit.get("return_against"), doc["name"])
		self.assertEqual(credit.get("docstatus"), 0)

		outstanding = get_outstanding_invoices(company, "Customer", WALK_IN)
		self.assertTrue(outstanding is None or isinstance(outstanding, list))

		payment = get_payment_entry("Sales Invoice", doc["name"])
		self.assertEqual(payment.get("doctype"), "Payment Entry")
		refs = payment.get("references") or []
		self.assertTrue(refs)
		self.assertEqual(refs[0].get("reference_name"), doc["name"])

		cancelled = cancel("Sales Invoice", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

		if not frappe.get_meta("Sales Invoice").has_field("uae_e_invoice_status"):
			self.skipTest("uae_e_invoice_status custom field missing")
		frappe.db.set_value(
			"Sales Invoice",
			doc["name"],
			"uae_e_invoice_status",
			"Accepted",
			update_modified=False,
		)
		from taxmate.api.workflow import amend

		amended = amend("Sales Invoice", doc["name"])
		self.assertEqual(amended["docstatus"], 0)
		self.assertEqual(amended["amended_from"], doc["name"])
		self.assertFalse(amended.get("uae_e_invoice_status"))

	def test_purchase_invoice_insert_then_submit(self):
		from taxmate.api.workflow import cancel, submit
		from taxmate.tests.uae_prove_fixtures import SERVICE_ITEM, require_prove_site

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))

		supplier = "Desert Supplies LLC"
		item = frappe.db.get_value("Item", {"disabled": 0, "is_purchase_item": 1}) or SERVICE_ITEM
		doc = insert(
			{
				"doctype": "Purchase Invoice",
				"company": company,
				"supplier": supplier,
				"posting_date": "2026-11-15",
				"due_date": "2026-11-15",
				"set_posting_time": 1,
				"currency": "AED",
				"conversion_rate": 1,
				"vat_emirate": "Dubai",
				"update_stock": 0,
				"bill_no": "TM-API-BILL",
				"bill_date": "2026-11-10",
				"items": [{"item_code": item, "qty": 1, "rate": 50}],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		self.assertEqual(str(doc.get("bill_date") or ""), "2026-11-10")
		self.assertEqual(doc.get("bill_no"), "TM-API-BILL")
		submitted = submit({"doctype": "Purchase Invoice", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		cancelled = cancel("Purchase Invoice", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

	def test_purchase_order_insert_submit_then_make_receipt(self):
		from taxmate.api.purchase_order import make_purchase_receipt
		from taxmate.api.workflow import cancel, submit
		from taxmate.tests.uae_prove_fixtures import SERVICE_ITEM, require_prove_site

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))

		supplier = "Desert Supplies LLC"
		if not frappe.db.exists("Supplier", supplier):
			self.skipTest(f"Missing supplier {supplier}")
		item = frappe.db.get_value("Item", {"disabled": 0, "is_purchase_item": 1}) or SERVICE_ITEM
		doc = insert(
			{
				"doctype": "Purchase Order",
				"company": company,
				"supplier": supplier,
				"transaction_date": "2026-11-15",
				"schedule_date": "2026-11-30",
				"currency": "AED",
				"conversion_rate": 1,
				"buying_price_list": "Standard Buying",
				"price_list_currency": "AED",
				"plc_conversion_rate": 1,
				"items": [
					{
						"item_code": item,
						"qty": 1,
						"rate": 50,
						"schedule_date": "2026-11-30",
					}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		submitted = submit({"doctype": "Purchase Order", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)

		mapped = make_purchase_receipt(submitted["name"])
		self.assertEqual(mapped.get("doctype"), "Purchase Receipt")
		self.assertEqual(int(mapped.get("docstatus") or 0), 0)
		self.assertTrue(mapped.get("items"))
		self.assertTrue(mapped.get("__islocal") or str(mapped.get("name") or "").startswith("new-"))

		cancelled = cancel("Purchase Order", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

	def test_journal_entry_insert_then_submit(self):
		from taxmate.api.workflow import cancel, submit
		from taxmate.tests.uae_prove_fixtures import require_prove_site

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))

		leaves = frappe.get_all(
			"Account",
			filters={
				"company": company,
				"is_group": 0,
				"disabled": 0,
				"account_type": ["not in", ["Receivable", "Payable"]],
			},
			pluck="name",
			limit=10,
		)
		if len(leaves) < 2:
			self.skipTest("need two non-party leaf accounts for the company")

		cost_center = frappe.db.get_value("Company", company, "cost_center")
		line = {"cost_center": cost_center} if cost_center else {}
		doc = insert(
			{
				"doctype": "Journal Entry",
				"company": company,
				"posting_date": "2026-11-15",
				"voucher_type": "Journal Entry",
				"user_remark": "TaxMate SPA journal entry write-path test",
				"accounts": [
					{
						**line,
						"account": leaves[0],
						"debit_in_account_currency": 25,
						"credit_in_account_currency": 0,
					},
					{
						**line,
						"account": leaves[1],
						"debit_in_account_currency": 0,
						"credit_in_account_currency": 25,
					},
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		if cost_center:
			for row in doc.get("accounts") or []:
				self.assertEqual(row.get("cost_center"), cost_center)
		submitted = submit({"doctype": "Journal Entry", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		cancelled = cancel("Journal Entry", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

	def test_purchase_receipt_insert_then_submit(self):
		from taxmate.api.workflow import cancel, submit
		from taxmate.tests.uae_prove_fixtures import SERVICE_ITEM, require_prove_site

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))

		supplier = "Desert Supplies LLC"
		if not frappe.db.exists("Supplier", supplier):
			self.skipTest(f"Missing supplier {supplier}")
		item = frappe.db.get_value("Item", {"disabled": 0, "is_purchase_item": 1}) or SERVICE_ITEM
		warehouse = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0})
		if not warehouse:
			self.skipTest("need a leaf warehouse for the company")
		doc = insert(
			{
				"doctype": "Purchase Receipt",
				"company": company,
				"supplier": supplier,
				"posting_date": "2026-09-15",
				"set_posting_time": 1,
				"set_warehouse": warehouse,
				"currency": "AED",
				"conversion_rate": 1,
				"buying_price_list": "Standard Buying",
				"price_list_currency": "AED",
				"plc_conversion_rate": 1,
				"items": [
					{
						"item_code": item,
						"qty": 1,
						"rate": 50,
						"warehouse": warehouse,
					}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		submitted = submit({"doctype": "Purchase Receipt", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		cancelled = cancel("Purchase Receipt", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

	def test_draft_purchase_invoice_from_incoming(self):
		import json

		from taxmate.tests.uae_prove_fixtures import require_prove_site
		from taxmate.uae_e_invoicing.doctype.uae_incoming_invoice.uae_incoming_invoice import (
			create_purchase_invoice,
		)

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))

		supplier = "Desert Supplies LLC"
		incoming = insert(
			{
				"doctype": "UAE Incoming Invoice",
				"company": company,
				"status": "Received",
				"asp_document_id": f"tm-in-{uuid.uuid4().hex[:12]}",
				"issue_date": "2026-11-15",
				"currency": "AED",
				"supplier_name": supplier,
				"total_amount": 105,
				"tax_amount": 5,
				"payload": json.dumps(
					{
						"ID": "SUP-BILL-1",
						"InvoiceLine": [
							{
								"Item": {"Name": "Received service"},
								"InvoicedQuantity": {"value": 1, "unitCode": "Nos"},
								"Price": {"PriceAmount": {"value": 100}},
								"LineExtensionAmount": {"value": 100},
							}
						],
						"TaxTotal": [{"TaxAmount": {"value": 5}}],
					}
				),
			}
		)
		invoice_name = create_purchase_invoice(incoming["name"])
		self.assertTrue(frappe.db.exists("Purchase Invoice", invoice_name))
		refreshed = get("UAE Incoming Invoice", incoming["name"])
		self.assertEqual(refreshed["status"], "Drafted")
		self.assertEqual(refreshed["purchase_invoice"], invoice_name)
		frappe.delete_doc("Purchase Invoice", invoice_name, force=True)
		frappe.delete_doc("UAE Incoming Invoice", incoming["name"], force=True)


class TestApiSearch(FrappeTestCase):
	def test_awesome_search_returns_wave1_pages(self):
		from taxmate.api.search import awesome

		result = awesome(text="invoice", limit=10)
		self.assertEqual(result["query"], "invoice")
		self.assertTrue(result["groups"])
		routes = [hit["route"] for group in result["groups"] for hit in group["results"]]
		self.assertTrue(any(route.startswith("/invoices") for route in routes))
		self.assertFalse(any(route.startswith("/app/") for route in routes))


class TestSalesOrderApi(FrappeTestCase):
	def test_fulfilment_summary_shape(self):
		from taxmate.api.sales_order import fulfilment_summary

		summary = fulfilment_summary()
		for key in (
			"committed",
			"delivered_value",
			"billed_value",
			"unbilled_delivered",
			"open_count",
			"overdue_count",
		):
			self.assertIn(key, summary)

	def test_sales_order_insert_then_submit_sets_status(self):
		from taxmate.tests.uae_prove_fixtures import (
			SERVICE_ITEM,
			WALK_IN,
			_ensure_walk_in,
			require_prove_site,
		)

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))
		_ensure_walk_in()

		from taxmate.api.workflow import cancel, submit

		doc = insert(
			{
				"doctype": "Sales Order",
				"company": company,
				"customer": WALK_IN,
				"order_type": "Sales",
				"transaction_date": "2026-11-15",
				"delivery_date": "2026-11-30",
				# Place of Supply: the Desk fetch_from does not fire on a
				# server-side insert, and the prove company has no Address to
				# resolve it from, so set it the way an operator would.
				"vat_emirate": "Dubai",
				"currency": "AED",
				"conversion_rate": 1,
				"selling_price_list": "Standard Selling",
				"price_list_currency": "AED",
				"plc_conversion_rate": 1,
				"taxes_and_charges": "UAE VAT 5% - TM",
				"items": [
					{
						"item_code": SERVICE_ITEM,
						"qty": 1,
						"rate": 100,
						"delivery_date": "2026-11-30",
					}
				],
			}
		)
		self.assertEqual(doc["docstatus"], 0)
		self.assertEqual(doc["status"], "Draft")

		submitted = submit({"doctype": "Sales Order", "name": doc["name"]})
		self.assertEqual(submitted["docstatus"], 1)
		self.assertNotEqual(submitted["status"], "Draft")

		cancelled = cancel("Sales Order", doc["name"])
		self.assertEqual(cancelled["docstatus"], 2)

	def test_get_or_create_vat_201(self):
		from taxmate.tests.uae_prove_fixtures import require_prove_site
		from taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log import get_or_create

		try:
			company = require_prove_site()
		except frappe.DoesNotExistError as exc:
			self.skipTest(str(exc))

		period_start = "2097-04-01"
		period_end = "2097-06-30"
		try:
			name = get_or_create(company, period_start, period_end)
		except frappe.ValidationError as exc:
			self.skipTest(str(exc))

		self.assertTrue(name)
		fetched = get("UAE VAT 201 Filing Log", name)
		self.assertEqual(fetched["docstatus"], 0)
		self.assertEqual(str(fetched["period_start"]), period_start)
		self.assertEqual(get_or_create(company, period_start, period_end), name)
