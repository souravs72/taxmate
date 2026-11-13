"""P&L total rows are not Account documents.

Callers: bench --site taxmate.site run-tests --module taxmate.tests.test_report_accounts
API: taxmate.api.reports.run_report, _mark_ledger_accounts
Schema: result rows {account, is_account: 0|1}; GL filters {account: list[str]}

User: P&L report - Profit of the year, total expense option - On click it gives an error
"""

from __future__ import annotations

import unittest

import frappe

from taxmate.api.reports import _keep_existing_accounts, _mark_ledger_accounts, run_report


class TestReportAccounts(unittest.TestCase):
	def test_mark_ledger_accounts_skips_statement_totals(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		real = frappe.db.get_value("Account", {"company": company}, "name")
		if not real:
			self.skipTest("No Account")
		result = {
			"result": [
				{"account": real},
				{"account": "'Profit for the year'"},
				{"account": "'Total Expense (Debit)'"},
			]
		}
		_mark_ledger_accounts(result, company)
		self.assertEqual(result["result"][0]["is_account"], 1)
		self.assertEqual(result["result"][1]["is_account"], 0)
		self.assertEqual(result["result"][2]["is_account"], 0)

	def test_run_report_gl_ignores_statement_total_account(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		result = run_report(
			"General Ledger",
			{
				"company": company,
				"from_date": "2026-11-01",
				"to_date": "2026-11-30",
				"account": ["'Profit for the year'"],
			},
		)
		self.assertEqual(result.get("result"), [])

	def test_keep_existing_accounts_drops_only_totals(self):
		company = frappe.defaults.get_user_default("Company") or frappe.db.get_value("Company", {}, "name")
		if not company:
			self.skipTest("No Company")
		real = frappe.db.get_value("Account", {"company": company}, "name")
		if not real:
			self.skipTest("No Account")
		mixed = {"company": company, "account": [real, "'Profit for the year'"]}
		self.assertTrue(_keep_existing_accounts(mixed))
		self.assertEqual(mixed["account"], [real])
		totals = {"company": company, "account": ["'Profit for the year'"]}
		self.assertFalse(_keep_existing_accounts(totals))
		self.assertEqual(totals["account"], ["'Profit for the year'"])
