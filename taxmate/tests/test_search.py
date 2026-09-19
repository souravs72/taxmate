"""TaxMate AwesomeBar allowlist includes User, settings, and Invoice OCR DocTypes.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_search
"""

from __future__ import annotations

import unittest

from taxmate.search import ALLOWED_SEARCH_DOCTYPES, ALLOWED_SEARCH_MODULES


class TestSearchAllowlist(unittest.TestCase):
	def test_operator_and_idp_doctypes_are_allowed(self):
		for name in (
			"User",
			"Role",
			"User Permission",
			"System Settings",
			"Print Settings",
			"Data Import",
			"IDP Conversation",
			"IDP Settings",
		):
			self.assertIn(name, ALLOWED_SEARCH_DOCTYPES, name)

	def test_idp_module_is_allowed(self):
		self.assertIn("IDP", ALLOWED_SEARCH_MODULES)
