"""Home workspace: UAE accounting shortcuts, cards, and KPI number cards.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_home_workspace
"""

from __future__ import annotations

import json
import unittest

from taxmate.setup.home import (
	CONTENT_MARKER,
	build_home_content,
	merge_child_rows,
	split_shortcut_labels,
)


class TestHomeContent(unittest.TestCase):
	def test_content_lists_kpis_then_daily_then_uae_cards(self):
		content = build_home_content(
			number_card_labels=["Draft Sales Invoices", "Failed E-Invoices"],
			daily_shortcut_labels=["Sales Invoice", "Purchase Invoice"],
			uae_shortcut_labels=["VAT 201", "E-Invoices"],
			card_names=["UAE VAT", "E-Invoicing", "Accounting"],
		)
		blocks = json.loads(content)
		types = [block["type"] for block in blocks]
		self.assertIn("number_card", types)
		self.assertLess(types.index("number_card"), types.index("shortcut"))
		self.assertIn("card", types)
		self.assertIn(CONTENT_MARKER, content)
		self.assertIn("UAE VAT", content)
		self.assertIn("Failed E-Invoices", content)

	def test_merge_upserts_wanted_and_keeps_extras(self):
		existing = [
			{"label": "Item", "link_to": "Item", "type": "DocType"},
			{"label": "Sales Invoice", "link_to": "Sales Invoice", "type": "DocType"},
		]
		wanted = [
			{"label": "Sales Invoice", "link_to": "Sales Invoice", "type": "DocType", "format": "{} Draft"},
			{"label": "VAT 201", "link_to": "UAE VAT 201 Filing Log", "type": "DocType"},
		]
		merged = merge_child_rows(existing, wanted)
		by_label = {row["label"]: row for row in merged}
		self.assertEqual(by_label["Sales Invoice"]["format"], "{} Draft")
		self.assertEqual(by_label["Item"]["link_to"], "Item")
		self.assertEqual(by_label["VAT 201"]["link_to"], "UAE VAT 201 Filing Log")
		self.assertEqual([row["label"] for row in merged][:2], ["Sales Invoice", "VAT 201"])

	def test_extra_shortcuts_are_not_uae_tax(self):
		daily, uae, extra = split_shortcut_labels(
			[
				{"label": "Sales Invoice"},
				{"label": "VAT 201"},
				{"label": "Leaderboard"},
			],
			[{"label": "Sales Invoice"}],
			[{"label": "VAT 201"}],
		)
		self.assertEqual(daily, ["Sales Invoice"])
		self.assertEqual(uae, ["VAT 201"])
		self.assertEqual(extra, ["Leaderboard"])
		content = build_home_content(
			number_card_labels=[],
			daily_shortcut_labels=daily,
			uae_shortcut_labels=uae,
			extra_shortcut_labels=extra,
			card_names=["UAE VAT"],
		)
		blocks = json.loads(content)
		uae_names = []
		in_uae = False
		for block in blocks:
			if block["id"] == "tm_home_uae_hdr":
				in_uae = True
				continue
			if block["type"] == "header":
				in_uae = False
			if in_uae and block["type"] == "shortcut":
				uae_names.append(block["data"]["shortcut_name"])
		self.assertEqual(uae_names, ["VAT 201"])
		self.assertIn("Leaderboard", content)
		self.assertIn("tm_home_more_hdr", content)


try:
	import frappe
	from frappe.tests.utils import FrappeTestCase
except Exception:  # pragma: no cover
	frappe = None
	FrappeTestCase = unittest.TestCase


class TestHomeWorkspaceSite(FrappeTestCase):
	def test_ensure_installs_uae_home_kpis_and_shortcuts(self):
		if not getattr(frappe, "local", None) or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		if not frappe.db.exists("Workspace", "Home"):
			self.skipTest("Workspace Home is missing")

		from taxmate.setup.home import ensure_uae_home_workspace

		ensure_uae_home_workspace()
		ensure_uae_home_workspace()

		home = frappe.get_doc("Workspace", "Home")
		self.assertIn(CONTENT_MARKER, home.content or "")

		shortcut_labels = {row.label for row in home.shortcuts}
		for label in ("Sales Invoice", "Purchase Invoice", "VAT 201", "E-Invoices"):
			self.assertIn(label, shortcut_labels, label)

		card_labels = {row.label for row in home.links if row.type == "Card Break"}
		for label in ("UAE VAT", "E-Invoicing", "Corporate Tax"):
			self.assertIn(label, card_labels, label)

		card_names = {row.number_card_name for row in home.number_cards}
		for name in (
			"Draft Sales Invoices",
			"Failed E-Invoices",
			"Overdue VAT 201",
			"Draft VAT 201",
		):
			self.assertTrue(frappe.db.exists("Number Card", name), name)
			self.assertIn(name, card_names, name)

		overdue = frappe.get_doc("Number Card", "Overdue VAT 201")
		self.assertIn("docstatus", overdue.filters_json or "")
		draft = frappe.get_doc("Number Card", "Draft VAT 201")
		self.assertIn("docstatus", draft.filters_json or "")
