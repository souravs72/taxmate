"""Phase 7 multi-entity helpers (VAT group, AED tax currency, role)."""

import datetime
import unittest

from taxmate.uae_vat.utils.tax_currency import to_aed
from taxmate.uae_vat.utils.vat_201 import compute_totals
from taxmate.uae_vat.utils.vat_group import date_windows_overlap, in_membership_window, merge_vat_201_boxes

try:
	import frappe
	from frappe.tests.utils import FrappeTestCase
except Exception:  # pragma: no cover - module also runs as pure unittest
	frappe = None
	FrappeTestCase = unittest.TestCase


def d(year, month, day):
	return datetime.date(year, month, day)


class TestTaxCurrency(unittest.TestCase):
	def test_identity_rate(self):
		self.assertEqual(to_aed(100, 1), 100)

	def test_usd_to_aed(self):
		self.assertEqual(to_aed(100, 3.67), 367)


class TestVatGroupWindows(unittest.TestCase):
	def test_overlap(self):
		self.assertTrue(date_windows_overlap(d(2026, 1, 1), d(2026, 12, 31), d(2026, 6, 1), None))
		self.assertFalse(date_windows_overlap(d(2026, 1, 1), d(2026, 3, 31), d(2026, 4, 1), None))

	def test_in_window(self):
		self.assertTrue(in_membership_window(d(2026, 6, 1), d(2026, 1, 1), None))
		self.assertFalse(in_membership_window(d(2025, 12, 31), d(2026, 1, 1), None))
		self.assertFalse(in_membership_window(d(2027, 1, 1), d(2026, 1, 1), d(2026, 12, 31)))


class TestMergeVat201(unittest.TestCase):
	def test_sums_box_1_and_skips_totals(self):
		left = {
			"boxes": [
				{"box_no": "1a", "legend": "Abu Dhabi", "amount": 100, "vat_amount": 5},
				{"box_no": "9", "legend": "Expenses", "amount": 50, "vat_amount": 2},
				{"box_no": "8", "legend": "Total", "amount": 0, "vat_amount": 5},
			]
		}
		right = {
			"boxes": [
				{"box_no": "1a", "legend": "Abu Dhabi", "amount": 20, "vat_amount": 1},
				{"box_no": "9", "legend": "Expenses", "amount": 10, "vat_amount": 0.5},
			]
		}
		merged = merge_vat_201_boxes([left, right])
		by_box = {row["box_no"]: row for row in merged}
		self.assertEqual(by_box["1a"]["amount"], 120)
		self.assertEqual(by_box["1a"]["vat_amount"], 6)
		self.assertEqual(by_box["9"]["vat_amount"], 2.5)
		self.assertNotIn("8", by_box)
		totals = compute_totals(6, 0, 0, 0, 0, 2.5, 0)
		self.assertEqual(totals["box_8_vat_amount"], 6)
		self.assertEqual(totals["box_11_vat_amount"], 2.5)
		self.assertEqual(totals["net_vat_due"], 3.5)

	def test_append_rebuilds_totals(self):
		from taxmate.uae_vat.utils.vat_201 import append_vat_201_totals

		boxes, totals = append_vat_201_totals(
			[
				{"box_no": "1a", "legend": "Abu Dhabi", "amount": 100, "vat_amount": 5},
				{"box_no": "9", "legend": "Expenses", "amount": 50, "vat_amount": 2},
				{"box_no": "10", "legend": "RCM", "amount": 0, "vat_amount": 9},
			]
		)
		by_box = {row["box_no"]: row for row in boxes}
		self.assertEqual(by_box["8"]["vat_amount"], 5)
		self.assertEqual(by_box["11"]["vat_amount"], 11)
		self.assertEqual(by_box["10"]["vat_amount"], 9)
		self.assertEqual(totals["net_vat_due"], -6)


class TestTenancySite(FrappeTestCase):
	"""Site checks — skipped when Frappe is not connected."""

	def _frappe(self):
		try:
			import frappe

			if not getattr(frappe.local, "site", None):
				self.skipTest("No Frappe site")
			return frappe
		except Exception:
			self.skipTest("No Frappe site")

	def test_role_and_doctypes(self):
		frappe = self._frappe()
		from taxmate.uae_vat.constants.tenancy import TAX_MANAGER_ROLE

		self.assertTrue(frappe.db.exists("Role", TAX_MANAGER_ROLE))
		for doctype in ("UAE VAT Group", "UAE Establishment", "UAE VAT Audit Event", "UAE VAT Group Member"):
			self.assertTrue(frappe.db.exists("DocType", doctype), doctype)
			meta = frappe.get_meta(doctype)
			self.assertTrue(meta.get("field_order") or meta.fields)

	def test_vat_201_tax_currency_aed(self):
		frappe = self._frappe()
		from taxmate.uae.constants import UAE_COUNTRY
		from taxmate.uae_vat.utils.vat_201 import compute_vat_201

		company = frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")
		if not company:
			self.skipTest("No UAE company")
		result = compute_vat_201(company, "2099-04-01", "2099-06-30")
		self.assertEqual(result["tax_currency"], "AED")
		self.assertTrue(result["tax_currency_rate"])

	def test_audit_event_rejects_manual_insert(self):
		frappe = self._frappe()
		from taxmate.uae.constants import UAE_COUNTRY

		if not frappe.db.exists("DocType", "UAE VAT Audit Event"):
			self.skipTest("Audit Event DocType missing")
		company = frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")
		doc = frappe.get_doc(
			{
				"doctype": "UAE VAT Audit Event",
				"company": company,
				"ref_doctype": "Purchase Invoice",
				"ref_name": "NO-SUCH",
				"fieldname": "uae_box_9_manual",
				"old_value": "0",
				"new_value": "1",
			}
		)
		with self.assertRaises(frappe.ValidationError):
			doc.insert()

	def test_group_vat_status_runs(self):
		self._frappe()
		from taxmate.uae_vat.report.uae_group_vat_status.uae_group_vat_status import execute

		columns, data = execute()
		self.assertGreaterEqual(len(columns), 5)
		self.assertIsInstance(data, list)

	def test_establishment_rejects_non_uae(self):
		frappe = self._frappe()
		other = frappe.db.get_value("Company", {"country": ["!=", "United Arab Emirates"]}, "name")
		if not other:
			self.skipTest("No non-UAE company")
		doc = frappe.get_doc(
			{
				"doctype": "UAE Establishment",
				"company": other,
				"establishment_name": "Foreign branch",
				"establishment_type": "Mainland",
				"emirate": "Dubai",
			}
		)
		with self.assertRaises(frappe.ValidationError):
			doc.insert()

	def test_vat_group_needs_two_members(self):
		frappe = self._frappe()
		from taxmate.uae.constants import UAE_COUNTRY
		from taxmate.uae.validation import is_valid_uae_trn

		company = frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")
		if not company:
			self.skipTest("No UAE company")
		if not is_valid_uae_trn(frappe.db.get_value("Company", company, "tax_id") or ""):
			self.skipTest("Company TRN invalid")
		doc = frappe.get_doc(
			{
				"doctype": "UAE VAT Group",
				"representative_company": company,
				"election_date": "2026-01-01",
				"members": [
					{"company": company, "from_date": "2026-01-01", "is_representative": 1},
				],
			}
		)
		with self.assertRaises(frappe.ValidationError):
			doc.insert()


if __name__ == "__main__":
	unittest.main()
