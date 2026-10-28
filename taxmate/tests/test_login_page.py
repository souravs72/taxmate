"""TaxMate owns /login. Auth still posts to Frappe guest methods.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_login_page
"""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock

import frappe
from frappe.exceptions import Redirect

from taxmate.www.login import (
	TAXMATE_LOGO,
	_brand_logo,
	_safe_redirect_path,
	_support_email,
	get_context,
)

APP_ROOT = Path(__file__).resolve().parents[1]
HTML = (APP_ROOT / "www" / "login.html").read_text()
CSS = (APP_ROOT / "public" / "css" / "login.css").read_text()


class TestLoginPage(unittest.TestCase):
	def test_template_uses_taxmate_assets_and_frappe_login(self):
		self.assertIn("/assets/taxmate/css/login.css", HTML)
		self.assertNotIn("ascra_theme_2", HTML)
		self.assertNotIn("ascra_theme_2", CSS)
		self.assertIn('post("login"', HTML)
		self.assertIn("frappe.core.doctype.user.user.reset_password", HTML)
		self.assertIn("frappe.www.login.send_login_link", HTML)
		self.assertIn('|| "/taxmate"', HTML)
		self.assertNotIn("/app/", HTML)
		self.assertNotIn("/desk", HTML)

	def test_brand_logo_replaces_erpnext_default(self):
		self.assertEqual(_brand_logo(""), TAXMATE_LOGO)
		self.assertEqual(_brand_logo("/assets/erpnext/images/erpnext-logo.svg"), TAXMATE_LOGO)
		self.assertEqual(_brand_logo("/files/custom-mark.png"), "/files/custom-mark.png")

	def test_safe_redirect_path_keeps_only_same_origin_paths(self):
		self.assertEqual(_safe_redirect_path("/taxmate/invoices"), "/taxmate/invoices")
		self.assertEqual(_safe_redirect_path("https://evil.example/phish"), "")
		self.assertEqual(_safe_redirect_path("//evil.example"), "")
		self.assertEqual(_safe_redirect_path("///evil.example"), "")
		self.assertEqual(_safe_redirect_path('/\t//evil.example'), "")
		self.assertEqual(_safe_redirect_path("/%09//evil.example"), "")
		self.assertEqual(_safe_redirect_path('/\x0c//evil.example'), "")
		self.assertEqual(_safe_redirect_path(""), "")

	def test_guest_context_fills_taxmate_copy(self):
		previous = frappe.session.user
		previous_request = getattr(frappe.local, "request", None)
		previous_form = frappe.form_dict
		try:
			frappe.set_user("Guest")
			frappe.form_dict = frappe._dict()
			req = MagicMock()
			req.args = {}
			frappe.local.request = req
			ctx = get_context(frappe._dict())
		finally:
			frappe.set_user(previous)
			frappe.local.request = previous_request
			frappe.form_dict = previous_form

		self.assertEqual(ctx.full_width, 1)
		self.assertEqual(ctx.no_sidebar, 1)
		self.assertTrue(ctx.tm_app_name)
		self.assertFalse(str(ctx.tm_logo).endswith("erpnext-logo.svg"))
		self.assertTrue(ctx.tm_hero_title)
		self.assertEqual(len(ctx.tm_features), 3)
		self.assertIn("net", ctx.tm_card)
		self.assertEqual(ctx.tm_redirect_qs, "")
		self.assertIsInstance(_support_email(), str)

	def test_guest_context_sanitises_redirect_query(self):
		previous = frappe.session.user
		previous_request = getattr(frappe.local, "request", None)
		previous_form = frappe.form_dict
		try:
			frappe.set_user("Guest")
			req = MagicMock()
			req.args = {}
			frappe.local.request = req

			frappe.form_dict = frappe._dict({"redirect-to": "/taxmate/invoices"})
			ok = get_context(frappe._dict())
			self.assertEqual(ok.tm_redirect_qs, "&redirect-to=/taxmate/invoices")

			frappe.form_dict = frappe._dict({"redirect-to": "https://evil.example/phish"})
			bad = get_context(frappe._dict())
			self.assertEqual(bad.tm_redirect_qs, "")
		finally:
			frappe.set_user(previous)
			frappe.local.request = previous_request
			frappe.form_dict = previous_form

	def test_signed_in_user_is_redirected(self):
		req = MagicMock()
		req.args = {"redirect-to": "/taxmate"}
		req.url = "http://taxmate.site/login?redirect-to=/taxmate"
		previous_request = getattr(frappe.local, "request", None)
		try:
			frappe.local.request = req
			with self.assertRaises(Redirect):
				get_context(frappe._dict())
		finally:
			frappe.local.request = previous_request
