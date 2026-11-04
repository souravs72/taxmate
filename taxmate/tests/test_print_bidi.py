"""Direction isolation, print-language amounts in words, and ledger labels in prints.

Companion to test_print_language.py, which covers which language a print is in.
This module covers whether what is printed is ordered and labelled correctly.

Run: bench --site taxmate.site run-tests --app taxmate --module taxmate.tests.test_print_bidi
"""

from __future__ import annotations

import re

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils.jinja import get_jenv

from taxmate.utils.jinja_methods import tm_account, tm_in_words

_ARABIC = re.compile(r"[؀-ۿ]")
PAYMENT = "templates/print_formats/uae_bilingual_payment.html"


def _render(path: str, doc, lang: str = "ar", **extra) -> str:
	frappe.local.lang = lang
	# frappe.lang is copied into the Jinja sandbox when the env is built.
	frappe.local.jenv = None
	return get_jenv().get_template(path).render({"doc": doc, **extra})


def _payment_doc():
	"""A Payment Entry stand-in. Not a Document — the template only reads fields."""
	doc = frappe._dict(
		doctype="Payment Entry",
		name="ACC-PAY-TEST-0001",
		docstatus=1,
		payment_type="Pay",
		company=frappe.db.get_single_value("Global Defaults", "default_company") or "Test Company",
		party_type="Supplier",
		party="SUP-0001",
		party_name="Gulf Metals FZE",
		reference_no="CHQ-884213",
		reference_date="2026-10-28",
		posting_date="2026-10-28",
		paid_from="Cash - XSm",
		paid_to="Debtors - XSm",
		paid_from_account_currency="AED",
		paid_to_account_currency="AED",
		paid_amount=10920.50,
		received_amount=10920.50,
		in_words="AED Ten Thousand Nine Hundred Twenty and Fifty Fils only.",
		remarks="Payment against PINV-2026-00114.",
		deductions=[],
		taxes=[],
		references=[],
	)
	doc.get_formatted = lambda field: doc.get(field)
	return doc


class TestAmountInWords(FrappeTestCase):
	def test_arabic_print_gets_arabic_words(self):
		frappe.local.lang = "ar"
		words = tm_in_words(1234.50, "AED")
		if not words:
			self.skipTest("money_in_words returned nothing on this site")
		self.assertTrue(_ARABIC.search(words), f"expected Arabic words, got {words!r}")

	def test_english_print_gets_english_words(self):
		frappe.local.lang = "en"
		words = tm_in_words(1234.50, "AED")
		if not words:
			self.skipTest("money_in_words returned nothing on this site")
		self.assertFalse(_ARABIC.search(words), f"expected English words, got {words!r}")

	def test_the_same_figure_reads_differently_in_the_two_languages(self):
		"""The point of recomputing: the stored value cannot do this."""
		frappe.local.lang = "en"
		english = tm_in_words(500, "AED")
		frappe.local.lang = "ar"
		arabic = tm_in_words(500, "AED")
		if not english or not arabic:
			self.skipTest("money_in_words returned nothing on this site")
		self.assertNotEqual(english, arabic)

	def test_nothing_to_say_is_an_empty_string_not_a_crash(self):
		for value in (None, "", 0, -5, "not a number"):
			self.assertEqual(tm_in_words(value, "AED"), "")

	def test_the_print_does_not_use_the_stored_words(self):
		"""in_words is written once, at save, in the saver's language."""
		doc = _payment_doc()
		html = _render(PAYMENT, doc, lang="ar")
		if not tm_in_words(doc.paid_amount, "AED"):
			self.skipTest("money_in_words returned nothing on this site")
		self.assertNotIn("Ten Thousand Nine Hundred Twenty", html)
		self.assertIn("In Words", html)

	def test_a_document_with_no_figure_still_prints(self):
		doc = _payment_doc()
		doc.paid_amount = 0
		doc.in_words = ""
		html = _render(PAYMENT, doc, lang="ar")
		self.assertIn("سند صرف", html)
		self.assertNotIn("In Words", html)


class TestLedgerLabelsInPrints(FrappeTestCase):
	def test_an_account_keeps_its_company_abbreviation(self):
		self.assertTrue(tm_account("Cash - XSm").endswith(" - XSm"))

	def test_blank_in_blank_out(self):
		self.assertEqual(tm_account(None), "")
		self.assertEqual(tm_account("   "), "")

	def test_the_print_labels_the_account_rather_than_printing_the_id(self):
		"""Same label the reports show — localize.ledger_label, one source."""
		from taxmate.utils.localize import ledger_label

		frappe.local.lang = "ar"
		doc = _payment_doc()
		html = _render(PAYMENT, doc, lang="ar")
		self.assertIn(ledger_label("Cash - XSm"), html)


class TestDirectionIsolation(FrappeTestCase):
	"""Frappe renders an Arabic print inside an RTL block.

	Anything Latin or numeric that is not isolated takes its order from that
	block: a date prints with its parts reversed, and the full stop of an
	English sentence lands at the left-hand edge.
	"""

	def test_every_amount_is_isolated_and_cannot_break(self):
		html = _render(PAYMENT, _payment_doc(), lang="ar")
		amounts = re.findall(r'<span class="tm-amt"[^>]*>', html)
		self.assertTrue(amounts, "no amounts rendered")
		for span in amounts:
			self.assertIn('dir="ltr"', span)
			self.assertIn("unicode-bidi:isolate", span)
			self.assertIn("white-space:nowrap", span)

	def test_the_document_number_and_dates_are_isolated(self):
		html = _render(PAYMENT, _payment_doc(), lang="ar")
		for value in ("ACC-PAY-TEST-0001", "CHQ-884213"):
			match = re.search(r'<span class="tm-ltr"[^>]*>' + re.escape(value), html)
			self.assertIsNotNone(match, f"{value} is not isolated")

	def test_stored_text_carries_its_own_direction(self):
		html = _render(PAYMENT, _payment_doc(), lang="ar")
		self.assertIn('<span class="tm-auto" dir="auto"', html)
		match = re.search(r'<span class="tm-auto"[^>]*>Gulf Metals FZE<', html)
		self.assertIsNotNone(match, "the party name is not isolated")

	def test_the_arabic_voucher_is_right_to_left(self):
		self.assertIn('dir="rtl"', _render(PAYMENT, _payment_doc(), lang="ar"))
		self.assertIn('dir="ltr"', _render(PAYMENT, _payment_doc(), lang="en"))

	def test_the_letterhead_is_contained(self):
		"""A floated logo or an absolutely positioned address must stay inside."""
		html = _render(
			PAYMENT,
			_payment_doc(),
			lang="ar",
			letter_head='<div style="float:left">LOGO</div>',
			no_letterhead=0,
		)
		self.assertIn("tm-lh", html)
		self.assertIn("overflow: hidden", html)
		plain = _render(PAYMENT, _payment_doc(), lang="ar", letter_head="LOGO", no_letterhead=1)
		self.assertNotIn("LOGO", plain)
