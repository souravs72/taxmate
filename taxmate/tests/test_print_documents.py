"""The six trade-document print formats, and which formats count as ours.

Run: bench --site taxmate.site run-tests --app taxmate --module taxmate.tests.test_print_documents
"""

from __future__ import annotations

import re

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils.jinja import get_jenv

from taxmate.api import printing

TEMPLATE = "templates/print_formats/uae_bilingual_document.html"

# format name -> doctype
FORMATS = {
	"UAE Quotation": "Quotation",
	"UAE Sales Order": "Sales Order",
	"UAE Delivery Note": "Delivery Note",
	"UAE Supplier Quotation": "Supplier Quotation",
	"UAE Purchase Order": "Purchase Order",
	"UAE Purchase Receipt": "Purchase Receipt",
}

BUYING = {"Supplier Quotation", "Purchase Order", "Purchase Receipt"}

TITLE_AR = {
	"Quotation": "عرض سعر",
	"Sales Order": "أمر بيع",
	"Delivery Note": "إشعار تسليم",
	"Supplier Quotation": "عرض سعر من مورد",
	"Purchase Order": "أمر شراء",
	"Purchase Receipt": "إشعار استلام",
}


def _render(doc, lang: str = "ar", **extra) -> str:
	frappe.local.lang = lang
	# frappe.lang is copied into the Jinja sandbox when the env is built.
	frappe.local.jenv = None
	return get_jenv().get_template(TEMPLATE).render({"doc": doc, **extra})


class _Doc:
	"""A document stand-in.

	Not frappe._dict: that is a dict subclass, so ``doc.items`` would reach
	dict.items rather than the child table and the item loop would not run.
	"""

	def __init__(self, **kw):
		self.__dict__.update(kw)

	def __getattr__(self, key):
		return None

	def get(self, key, default=None):
		return self.__dict__.get(key, default)

	def get_formatted(self, field):
		return self.__dict__.get(field)


def _doc(doctype: str, **kw):
	"""A trade document stand-in. The template only reads fields."""
	party = (
		{"supplier": "SUP-0001", "supplier_name": "Gulf Metals FZE"}
		if doctype in BUYING
		else {"customer": "CUST-0001", "customer_name": "Emirates Gold Trading LLC"}
	)
	fields = dict(
		doctype=doctype,
		name=f"TEST-{doctype.replace(' ', '')}-0001",
		docstatus=1,
		company=frappe.db.get_single_value("Global Defaults", "default_company") or "Test Company",
		currency="AED",
		transaction_date="2026-10-28",
		posting_date="2026-10-28",
		address_display="Office 1203, Burjuman Business Tower, Dubai",
		items=[
			_Doc(idx=1, item_code="ITEM-001", item_name="22K Casting Grain",
			     description="22K Casting Grain", qty=2, uom="Gram", rate=21000,
			     amount=42000, net_amount=42000, warehouse="Stores - XSm"),
		],
		taxes=[_Doc(description="VAT 5%", rate=5, tax_amount=2100, account_head="VAT - XSm")],
		net_total=42000,
		total=42000,
		total_taxes_and_charges=2100,
		grand_total=44100,
		rounded_total=44100,
		rounding_adjustment=0,
		**party,
	)
	fields.update(kw)
	return _Doc(**fields)


class TestFormatRecords(FrappeTestCase):
	"""These are standard Print Formats in the app — they arrive with bench migrate."""

	def test_each_format_is_installed_and_points_at_its_doctype(self):
		missing = [name for name in FORMATS if not frappe.db.exists("Print Format", name)]
		if missing:
			self.skipTest(f"not migrated on this site: {', '.join(missing)}")
		for name, doctype in FORMATS.items():
			row = frappe.db.get_value(
				"Print Format", name, ["doc_type", "module", "standard", "disabled", "print_format_type"], as_dict=True
			)
			self.assertEqual(row.doc_type, doctype, name)
			self.assertEqual(row.module, "TaxMate", name)
			self.assertEqual(row.standard, "Yes", name)
			self.assertEqual(row.disabled, 0, name)
			self.assertEqual(row.print_format_type, "Jinja", name)


class TestWhichFormatsAreOurs(FrappeTestCase):
	def test_every_module_in_modules_txt_counts_as_ours(self):
		mine = printing._our_modules()
		for module in ("TaxMate", "UAE VAT", "UAE E-Invoicing", "UAE Corporate Tax"):
			self.assertIn(module, mine)

	def test_the_bilingual_tax_invoice_is_recognised(self):
		"""It lives in UAE E-Invoicing, so a check for "TaxMate" alone missed it."""
		if not frappe.db.exists("Print Format", "UAE Bilingual Tax Invoice"):
			self.skipTest("the bilingual tax invoice is not on this site")
		out = printing.print_formats("Sales Invoice")
		ours = [f for f in out["formats"] if f["taxmate"]]
		self.assertTrue(ours, "no format was recognised as ours")
		self.assertEqual(out["formats"][0]["name"], ours[0]["name"], "ours must sort first")
		self.assertIn("UAE Bilingual Tax Invoice", [f["name"] for f in ours])
		# DocType Property Setter default_print_format wins when set (see README).
		configured = frappe.db.get_value(
			"Property Setter",
			{"doc_type": "Sales Invoice", "property": "default_print_format"},
			"value",
		)
		if not configured:
			self.assertEqual(out["default"], "UAE Bilingual Tax Invoice")

	def test_each_trade_document_defaults_to_its_new_format(self):
		for name, doctype in FORMATS.items():
			if not frappe.db.exists("Print Format", name):
				continue
			out = printing.print_formats(doctype)
			self.assertTrue(out["formats"][0]["taxmate"], doctype)
			self.assertEqual(out["formats"][0]["name"], name, doctype)
			configured = frappe.db.get_value(
				"Property Setter",
				{"doc_type": doctype, "property": "default_print_format"},
				"value",
			)
			if not configured:
				self.assertEqual(out["default"], name, doctype)

	def test_standard_is_still_offered_last(self):
		out = printing.print_formats("Purchase Order")
		self.assertEqual(out["formats"][-1]["name"], printing.STANDARD)


class TestTheSharedTemplate(FrappeTestCase):
	def test_every_doctype_renders_with_its_own_title(self):
		for doctype, title in TITLE_AR.items():
			html = _render(_doc(doctype), lang="ar")
			self.assertIn(title, html, doctype)

	def test_the_english_print_keeps_both_languages(self):
		html = _render(_doc("Purchase Order"), lang="en")
		self.assertIn("Purchase Order", html)
		self.assertIn("أمر شراء", html)
		self.assertIn("Document No. / رقم المستند", html)

	def test_the_arabic_print_drops_the_english_headings(self):
		html = _render(_doc("Purchase Order"), lang="ar")
		self.assertIn('dir="rtl"', html)
		self.assertNotIn("Document No.", html)
		self.assertNotIn("Grand Total", html)

	def test_the_seller_is_the_party_on_a_buying_document(self):
		buying = _render(_doc("Purchase Order"), lang="en")
		selling = _render(_doc("Sales Order"), lang="en")
		self.assertLess(buying.index("Gulf Metals FZE"), buying.index("Buyer / المشتري"))
		self.assertIn("Customer / العميل", selling)
		self.assertNotIn("Buyer / المشتري", selling)

	def test_an_unpriced_document_shows_the_warehouse_instead_of_money(self):
		doc = _doc("Delivery Note", grand_total=0, net_total=0, total_taxes_and_charges=0, taxes=[])
		html = _render(doc, lang="en")
		self.assertIn("Warehouse / المستودع", html)
		self.assertNotIn("Grand Total", html)
		self.assertNotIn("AED 0.00", html)

	def test_a_priced_document_totals_and_spells_out_the_figure(self):
		html = _render(_doc("Purchase Order"), lang="en")
		self.assertIn("Grand Total / الإجمالي شامل الضريبة", html)
		self.assertIn("In Words / كتابة", html)

	def test_dates_and_numbers_are_isolated(self):
		html = _render(_doc("Sales Order", delivery_date="2026-11-10", po_no="PO-EGT-5521"), lang="ar")
		for value in ("2026-11-10", "PO-EGT-5521", "TEST-SalesOrder-0001"):
			self.assertIsNotNone(
				re.search(r'<span class="tm-ltr"[^>]*>' + re.escape(value), html), f"{value} is not isolated"
			)

	def test_stored_text_carries_its_own_direction(self):
		html = _render(_doc("Purchase Order"), lang="ar")
		self.assertIsNotNone(re.search(r'<span class="tm-auto"[^>]*>Gulf Metals FZE<', html))

	def test_english_terms_under_an_arabic_heading_keep_their_direction(self):
		"""dir=auto on the block that holds the Arabic heading would flip them."""
		doc = _doc("Purchase Order", terms="<p>Payment within 30 days.</p>")
		html = _render(doc, lang="ar")
		self.assertIn('class="terms-body" dir="auto"', html)

	def test_an_unknown_doctype_still_renders(self):
		"""The format is only attached to six doctypes, but a copy may not be."""
		html = _render(_doc("Material Request"), lang="en")
		self.assertIn("Material Request", html)


class TestAgainstRealDocuments(FrappeTestCase):
	def test_render_each_format_against_a_document_on_this_site(self):
		rendered = 0
		for name, doctype in FORMATS.items():
			if not frappe.db.exists("Print Format", name):
				continue
			doc_name = frappe.db.get_value(doctype, {"docstatus": ["<", 2]}, "name", order_by="modified desc")
			if not doc_name:
				continue
			for lang in ("en", "ar"):
				out = printing.render(doctype, doc_name, print_format=name, language=lang)
				self.assertTrue(out["html"], f"{name} rendered nothing in {lang}")
				self.assertEqual(out["format"], name)
			rendered += 1
		if not rendered:
			self.skipTest("no documents of these types on this site")
