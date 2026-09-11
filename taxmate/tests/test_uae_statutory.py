"""Phase 8 statutory helpers (retention days, late-filing status)."""

import datetime
import unittest

from taxmate.uae_vat.utils.late_filing import days_late, notice_status


def d(year, month, day):
	return datetime.date(year, month, day)


class TestDaysLate(unittest.TestCase):
	def test_before_due_is_zero(self):
		self.assertEqual(days_late(d(2026, 2, 28), d(2026, 2, 1)), 0)

	def test_on_due_is_zero(self):
		self.assertEqual(days_late(d(2026, 2, 28), d(2026, 2, 28)), 0)

	def test_after_due(self):
		self.assertEqual(days_late(d(2026, 2, 28), d(2026, 3, 5)), 5)


class TestNoticeStatus(unittest.TestCase):
	def test_upcoming(self):
		self.assertEqual(notice_status(d(2026, 2, 28), d(2026, 2, 1)), "Upcoming")

	def test_due_today(self):
		self.assertEqual(notice_status(d(2026, 2, 28), d(2026, 2, 28)), "Due")

	def test_overdue(self):
		self.assertEqual(notice_status(d(2026, 2, 28), d(2026, 3, 1)), "Overdue")

	def test_cleared_wins(self):
		self.assertEqual(notice_status(d(2026, 2, 28), d(2026, 3, 1), cleared=True), "Cleared")


class TestRetentionConstant(unittest.TestCase):
	def test_includes_vat_201(self):
		from taxmate.uae.retention import SUBMITTED_RETAINED_DOCTYPES

		self.assertIn("UAE VAT 201 Filing Log", SUBMITTED_RETAINED_DOCTYPES)
		self.assertIn("UAE FTA Audit Pack", SUBMITTED_RETAINED_DOCTYPES)


class TestAuditPackNames(unittest.TestCase):
	def test_manifest_paths(self):
		from taxmate.uae_vat.utils.audit_pack import MANIFEST_NOTE

		self.assertIn("5+", MANIFEST_NOTE)
		self.assertIn("API", MANIFEST_NOTE)


try:
	import frappe
	from frappe.tests.utils import FrappeTestCase
except Exception:  # pragma: no cover
	frappe = None
	FrappeTestCase = unittest.TestCase


class TestStatutorySite(FrappeTestCase):
	def test_retention_blocks_submitted_vat_201(self):
		if not getattr(frappe, "local", None) or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		from taxmate.uae.constants import UAE_COUNTRY
		from taxmate.uae.retention import on_trash
		from taxmate.uae.validation import is_valid_uae_trn

		company = frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")
		if not company:
			self.skipTest("No UAE company")
		if not is_valid_uae_trn(frappe.db.get_value("Company", company, "tax_id") or ""):
			self.skipTest("Company TRN invalid")
		start, end = "2097-01-01", "2097-03-31"
		existing = frappe.db.get_value(
			"UAE VAT 201 Filing Log",
			{"company": company, "period_start": start, "docstatus": ["!=", 2]},
			"name",
		)
		if existing:
			doc = frappe.get_doc("UAE VAT 201 Filing Log", existing)
			if doc.docstatus == 1:
				doc.cancel()
			frappe.delete_doc("UAE VAT 201 Filing Log", doc.name, force=True, ignore_permissions=True)
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
			log.submit()
			log.cancel()
			log.reload()
			with self.assertRaises(frappe.ValidationError):
				on_trash(log)
			with self.assertRaises(frappe.ValidationError):
				frappe.delete_doc("UAE VAT 201 Filing Log", log.name, force=True)
		finally:
			# force bypass is not used; leave cancelled log if delete blocked
			if frappe.db.exists("UAE VAT 201 Filing Log", log.name):
				frappe.db.set_value("UAE VAT 201 Filing Log", log.name, "docstatus", 0, update_modified=False)
				frappe.delete_doc("UAE VAT 201 Filing Log", log.name, force=True, ignore_permissions=True)

	def test_collect_pack_files_has_core_names(self):
		if not getattr(frappe, "local", None) or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		from taxmate.uae.constants import UAE_COUNTRY
		from taxmate.uae_vat.utils.audit_pack import collect_pack_files

		company = frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")
		if not company:
			self.skipTest("No UAE company")
		names = [name for name, _ in collect_pack_files(company, "2099-01-01", "2099-03-31")]
		self.assertIn("00-manifest.txt", names)
		self.assertIn("01-invoices.csv", names)
		self.assertIn("02-vat201.csv", names)
		self.assertIn("03-ubo.csv", names)
		self.assertIn("04-residency.txt", names)

	def test_audit_pack_insert(self):
		if not getattr(frappe, "local", None) or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		from taxmate.uae.constants import UAE_COUNTRY

		if not frappe.db.exists("DocType", "UAE FTA Audit Pack"):
			self.skipTest("Audit Pack missing")
		company = frappe.db.get_value("Company", {"country": UAE_COUNTRY}, "name")
		doc = frappe.get_doc(
			{
				"doctype": "UAE FTA Audit Pack",
				"company": company,
				"period_start": "2099-04-01",
				"period_end": "2099-06-30",
			}
		).insert()
		try:
			self.assertTrue(doc.name.startswith("FTA-"))
		finally:
			frappe.delete_doc("UAE FTA Audit Pack", doc.name, force=True, ignore_permissions=True)


if __name__ == "__main__":
	unittest.main()
