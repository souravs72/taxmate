"""Clerk Invoice OCR: admin IDP DocTypes stay off the AP search surface.

Run: PYTHONPATH=apps/taxmate python -m unittest taxmate.tests.test_idp_clerk
"""

from __future__ import annotations

import unittest

from taxmate.idp.clerk import IDP_ADMIN_SEARCH_DOCTYPES, EXTRACT_PROMPT, _reject_new_items
from taxmate.search import ALLOWED_SEARCH_DOCTYPES


class TestIdpClerkAllowlist(unittest.TestCase):
	def test_admin_idp_doctypes_are_listed(self):
		for name in ("IDP Settings", "IDP Skill", "IDP Tool Call Log", "IDP Conversation"):
			self.assertIn(name, IDP_ADMIN_SEARCH_DOCTYPES)
			self.assertIn(name, ALLOWED_SEARCH_DOCTYPES)

	def test_extract_prompt_is_purchase_invoice(self):
		self.assertIn("Purchase Invoice", EXTRACT_PROMPT)

	def test_reject_new_items_allows_mapped_rows(self):
		card = {
			"items": {
				"rows": [
					{"index": 0, "erpnext_item": "ITEM-1", "extracted": {"name": "Ring"}},
				]
			}
		}
		_reject_new_items(card, {})

	def test_reject_new_items_blocks_unmapped_rows(self):
		card = {
			"items": {
				"rows": [
					{"index": 0, "erpnext_item": "", "extracted": {"name": "Gold Ring"}},
				]
			}
		}
		from unittest.mock import patch

		with patch("taxmate.idp.clerk.frappe.throw", side_effect=RuntimeError("unmapped")):
			with self.assertRaises(RuntimeError):
				_reject_new_items(card, {})

	def test_confirm_card_rejects_submit(self):
		from unittest.mock import patch

		from taxmate.idp.clerk import confirm_card

		with patch("taxmate.idp.clerk.frappe.throw", side_effect=RuntimeError("draft-only")) as throw:
			with self.assertRaises(RuntimeError):
				confirm_card("CONV", "MSG", "submit")
			throw.assert_called()
