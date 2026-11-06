"""The print preview API: formats on offer, permission, and print language.

Run: bench --site taxmate.site run-tests --app taxmate --module taxmate.tests.test_printing
"""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import printing


def _any(doctype: str) -> str | None:
	rows = frappe.get_all(doctype, pluck="name", limit=1)
	return rows[0] if rows else None


class TestPrintFormats(FrappeTestCase):
	def test_standard_is_always_offered(self):
		out = printing.print_formats("Sales Invoice")
		names = [f["name"] for f in out["formats"]]
		self.assertIn(printing.STANDARD, names)

	def test_taxmate_format_sorts_first_and_is_the_default(self):
		out = printing.print_formats("Sales Invoice")
		formats = out["formats"]
		if not any(f["taxmate"] for f in formats):
			self.skipTest("UAE Bilingual Tax Invoice is not installed on this site")
		self.assertTrue(formats[0]["taxmate"], "a TaxMate format must sort first")
		# Property Setter default_print_format wins when set on the DocType.
		configured = frappe.db.get_value(
			"Property Setter",
			{"doc_type": "Sales Invoice", "property": "default_print_format"},
			"value",
		)
		if not configured:
			self.assertEqual(out["default"], "UAE Bilingual Tax Invoice")

	def test_doctype_outside_the_api_is_refused(self):
		with self.assertRaises(frappe.PermissionError):
			printing.print_formats("Print Format")

	def test_disabled_formats_are_not_offered(self):
		name = frappe.db.get_value("Print Format", {"doc_type": "Sales Invoice", "disabled": 1}, "name")
		if not name:
			self.skipTest("no disabled Sales Invoice format on this site")
		names = [f["name"] for f in printing.print_formats("Sales Invoice")["formats"]]
		self.assertNotIn(name, names)


class TestRender(FrappeTestCase):
	def setUp(self):
		self.invoice = _any("Sales Invoice")
		if not self.invoice:
			self.skipTest("no Sales Invoice on this site")

	def test_render_returns_html_and_style(self):
		out = printing.render("Sales Invoice", self.invoice)
		self.assertTrue(out["html"])
		self.assertIn("format", out)
		self.assertIn("formats", out)

	def test_unknown_format_falls_back_to_the_default(self):
		out = printing.render("Sales Invoice", self.invoice, print_format="No Such Format")
		names = [f["name"] for f in out["formats"]]
		self.assertIn(out["format"], names)
		self.assertNotEqual(out["format"], "No Such Format")

	def test_missing_document_is_a_clean_error(self):
		with self.assertRaises(frappe.DoesNotExistError):
			printing.render("Sales Invoice", "SINV-does-not-exist")

	def test_letterhead_flag_is_honoured(self):
		self.assertEqual(printing.render("Sales Invoice", self.invoice, letterhead=0)["letterhead"], 0)
		self.assertEqual(printing.render("Sales Invoice", self.invoice, letterhead=1)["letterhead"], 1)

	def test_arabic_render_does_not_leak_into_the_session(self):
		"""The request language must be exactly what it was before."""
		before = frappe.local.lang
		printing.render("Sales Invoice", self.invoice, language="ar")
		self.assertEqual(frappe.local.lang, before)

	def test_language_changes_the_output(self):
		"""Arabic and English renders of the same document must differ.

		This is the whole point of the screen: the format follows the chosen
		print language rather than the session language.
		"""
		en = printing.render("Sales Invoice", self.invoice, language="en")
		ar = printing.render("Sales Invoice", self.invoice, language="ar")
		if not any(f["taxmate"] for f in en["formats"]):
			self.skipTest("no bilingual format installed to compare")
		self.assertNotEqual(en["html"], ar["html"])

	def test_an_unknown_language_is_ignored_rather_than_applied(self):
		out = printing.render("Sales Invoice", self.invoice, language="zz")
		self.assertNotEqual(out["language"], "zz")

	def test_render_rebuilds_jinja_for_the_print_language(self):
		from inspect import getsource

		src = getsource(printing._in_language)
		self.assertIn("print_language", src)
		self.assertIn("jenv", getsource(frappe.translate.print_language))
