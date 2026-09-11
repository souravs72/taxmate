"""Phase 2 VAT 201 filing helpers, customs, tourist/RCM fetchers (needs a site)."""

from __future__ import annotations

from inspect import getsource

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, today

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae.validation import is_valid_uae_trn
from taxmate.uae_vat.utils.period_lock import submitted_filing_for, validate_period_lock
from taxmate.uae_vat.utils.vat_201 import (
	_box_1_amount_sql,
	_reverse_charge_output,
	_tourist_refund,
	compute_vat_201,
	sum_customs_declarations,
)


def _uae_company() -> str | None:
	return frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")


def _delete_filing(company: str, period_start) -> None:
	name = frappe.db.get_value(
		"UAE VAT 201 Filing Log",
		{"company": company, "period_start": period_start, "docstatus": ["!=", 2]},
		"name",
	)
	if not name:
		name = frappe.db.get_value(
			"UAE VAT 201 Filing Log",
			{"company": company, "period_start": period_start},
			"name",
		)
	if not name:
		return
	doc = frappe.get_doc("UAE VAT 201 Filing Log", name)
	if doc.docstatus == 1:
		doc.cancel()
	frappe.delete_doc("UAE VAT 201 Filing Log", name, force=True, ignore_permissions=True)


class TestBox1Sql(FrappeTestCase):
	def test_box_1_vat_uses_uae_vat_accounts_query(self):
		from taxmate.uae_vat.utils import vat_201

		src = getsource(vat_201._box_1_vat_sql)
		self.assertIn("UAE VAT Account", src)
		self.assertIn("base_tax_amount", src)
		self.assertNotIn("sum(i.tax_amount)", src)
		self.assertIn("exists", src)

	def test_box_1_amount_sql_excludes_non_standard(self):
		sql = _box_1_amount_sql()
		self.assertIn("is_exempt", sql)
		self.assertIn("is_zero_rated", sql)

	def test_pack_invoice_tax_uses_uae_vat_accounts(self):
		from taxmate.uae_vat.utils import vat_201

		src = getsource(vat_201._uae_vat_by_voucher)
		self.assertIn("UAE VAT Account", src)
		self.assertIn("base_tax_amount", src)


class TestTouristAndRcmFetchers(FrappeTestCase):
	def test_queries_use_official_fields(self):
		from taxmate.uae_vat.utils import vat_201

		self.assertIn("tourist_tax_return", getsource(vat_201._tourist_refund))
		self.assertIn("reverse_charge", getsource(vat_201._reverse_charge_output))
		self.assertIn("UAE VAT Account", getsource(vat_201._reverse_charge_output))
		self.assertIn("UAE VAT Account", getsource(vat_201._reverse_charge_recoverable_input))
		self.assertIn("voucher_type", getsource(vat_201._reverse_charge_output))
		self.assertIn("exists", getsource(vat_201._box_1_vat_sql))

	def test_empty_future_period_is_zero(self):
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company on this site")
		filters = {"company": company, "from_date": "2099-01-01", "to_date": "2099-03-31"}
		self.assertEqual(_tourist_refund(filters)["vat_amount"], 0)
		self.assertEqual(_reverse_charge_output(filters)["vat_amount"], 0)
		result = compute_vat_201(company, "2099-01-01", "2099-03-31")
		self.assertEqual(
			[row["box_no"] for row in result["boxes"] if row["box_no"][:1] == "1" and row["box_no"][1:].isalpha()],
			["1a", "1b", "1c", "1d", "1e", "1f", "1g"],
		)
		self.assertEqual(result["net_vat_due"], 0)
		self.assertFalse(result["requires_manual_box_6_7"])


class TestPeriodLockHelper(FrappeTestCase):
	def test_no_filing_returns_none(self):
		self.assertIsNone(submitted_filing_for("__missing_company__", today()))

	def test_lock_after_submit(self):
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company on this site")
		if not is_valid_uae_trn(frappe.db.get_value("Company", company, "tax_id")):
			self.skipTest("Company TRN is not a 15-digit UAE TRN")

		start, end = "2098-01-01", "2098-03-31"
		_delete_filing(company, start)
		log = frappe.get_doc(
			{
				"doctype": "UAE VAT 201 Filing Log",
				"company": company,
				"period_start": start,
				"period_end": end,
			}
		).insert()
		try:
			log.generate()
			log.reload()
			self.assertTrue(log.company_trn)
			log.submit()
			self.assertEqual(submitted_filing_for(company, start), log.name)
			dummy = frappe._dict(
				doctype="Sales Invoice",
				name="TEST-LOCK",
				company=company,
				posting_date=start,
			)
			with self.assertRaises(frappe.ValidationError):
				validate_period_lock(dummy)
			from taxmate.uae_vat.overrides.sales_invoice import before_cancel

			with self.assertRaises(frappe.ValidationError):
				before_cancel(dummy)
			with self.assertRaises(frappe.ValidationError):
				frappe.get_doc(
					{
						"doctype": "UAE Customs Declaration",
						"company": company,
						"posting_date": start,
						"declaration_number": f"LOCK-{frappe.generate_hash(length=6)}",
						"taxable_amount": 1,
						"vat_amount": 0,
					}
				).insert()
		finally:
			_delete_filing(company, start)


class TestCustomsRollup(FrappeTestCase):
	def test_box_6_and_7_split(self):
		company = _uae_company()
		if not company:
			self.skipTest("No UAE company on this site")

		stamp = frappe.generate_hash(length=8)
		start = today()
		end = add_days(start, 1)
		before = sum_customs_declarations(company, start, end)
		docs = []
		try:
			for idx, (adj, amount, vat) in enumerate(((0, 1000, 50), (1, 200, 10)), start=1):
				doc = frappe.get_doc(
					{
						"doctype": "UAE Customs Declaration",
						"company": company,
						"posting_date": start,
						"declaration_number": f"T{stamp}-{idx}",
						"is_adjustment": adj,
						"taxable_amount": amount,
						"vat_amount": vat,
					}
				)
				doc.insert()
				doc.submit()
				docs.append(doc)

			after = sum_customs_declarations(company, start, end)
			self.assertEqual(after["box_6_amount"] - before["box_6_amount"], 1000)
			self.assertEqual(after["box_6_vat_amount"] - before["box_6_vat_amount"], 50)
			self.assertEqual(after["box_7_amount"] - before["box_7_amount"], 200)
			self.assertEqual(after["box_7_vat_amount"] - before["box_7_vat_amount"], 10)
		finally:
			for doc in docs:
				doc.reload()
				if doc.docstatus == 1:
					doc.cancel()
				frappe.delete_doc("UAE Customs Declaration", doc.name, force=True, ignore_permissions=True)
