"""Guest /plans, /terms and /privacy. No Desk routes.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_public_pages
"""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import MagicMock

import frappe

from taxmate.website_pages import FALLBACK_PLANS, shape_plans
from taxmate.www import plans as plans_page
from taxmate.www import privacy as privacy_page
from taxmate.www import terms as terms_page

APP_ROOT = Path(__file__).resolve().parents[1]


def _as_guest(fn):
	previous = frappe.session.user
	previous_request = getattr(frappe.local, "request", None)
	previous_form = frappe.form_dict
	try:
		frappe.set_user("Guest")
		frappe.form_dict = frappe._dict()
		req = MagicMock()
		req.args = {}
		req.path = "/"
		frappe.local.request = req
		return fn()
	finally:
		frappe.set_user(previous)
		frappe.local.request = previous_request
		frappe.form_dict = previous_form


class TestPublicPages(unittest.TestCase):
	def test_templates_are_guest_pages(self):
		bar = (APP_ROOT / "templates" / "includes" / "tm_public_bar.html").read_text()
		foot = (APP_ROOT / "templates" / "includes" / "tm_public_foot.html").read_text()
		chrome = bar + foot
		self.assertIn("tm_pricing_url", chrome)
		self.assertIn("tm_terms_url", chrome)
		self.assertIn("tm_privacy_url", chrome)
		self.assertIn("tm_login_url", chrome)
		self.assertNotIn("/app/", chrome)
		self.assertNotIn("/desk", chrome)
		for name in ("plans", "terms", "privacy"):
			html = (APP_ROOT / "www" / f"{name}.html").read_text()
			self.assertIn("/assets/taxmate/css/site.css", html)
			self.assertIn("templates/includes/tm_public_bar.html", html)
			self.assertNotIn("/app/", html)
			self.assertNotIn("/desk", html)
			self.assertNotIn("ascra_theme_2", html)

	def test_fallback_skus(self):
		rows = shape_plans(FALLBACK_PLANS)
		self.assertEqual([r["name"] for r in rows], ["starter", "retail", "multi_outlet"])
		self.assertEqual(rows[0]["monthly_label"], "AED 149")
		self.assertEqual(rows[1]["is_popular"], 1)
		self.assertTrue(rows[0]["bullets"])

	def test_guest_plans_context(self):
		ctx = _as_guest(lambda: plans_page.get_context(frappe._dict()))
		self.assertEqual(ctx.tm_nav, "plans")
		self.assertGreaterEqual(len(ctx.tm_plans), 3)
		self.assertGreater(int(ctx.tm_trial_days), 0)
		self.assertEqual(len(ctx.tm_faqs), 3)
		self.assertFalse(str(ctx.tm_login_url).startswith("/app"))

	def test_guest_terms_and_privacy_context(self):
		terms = _as_guest(lambda: terms_page.get_context(frappe._dict()))
		privacy = _as_guest(lambda: privacy_page.get_context(frappe._dict()))
		self.assertEqual(terms.tm_nav, "terms")
		self.assertEqual(privacy.tm_nav, "privacy")
		self.assertGreaterEqual(len(terms.tm_sections), 6)
		self.assertGreaterEqual(len(privacy.tm_sections), 5)
		self.assertEqual(terms.tm_terms_url, "/terms")
		self.assertEqual(privacy.tm_privacy_url, "/privacy")
