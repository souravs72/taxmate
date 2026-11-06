"""Financial statements reconcile to the ledger.

Cash Flow: Net Change in Cash equals the movement on the Cash and Bank
accounts, and opening + net change = closing, for every column. Trial
Balance: closing balances are net, and the fiscal year follows From Date.

Uses whichever company on the site has ledger entries; skips otherwise.
Run: bench --site taxmate.site run-tests --module taxmate.tests.test_financial_statements
"""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt, getdate

from taxmate.utils.cash_flow import OTHER_LABEL, _label, _periods, complete_cash_flow, run_cash_flow


def _company_with_gl():
	row = frappe.db.sql(
		"""select company, min(posting_date), max(posting_date) from `tabGL Entry`
		where is_cancelled=0 group by company order by count(*) desc limit 1"""
	)
	return row[0] if row else None


def _cash_accounts(company):
	return frappe.get_all(
		"Account",
		filters={"company": company, "is_group": 0, "account_type": ["in", ["Cash", "Bank"]]},
		pluck="name",
	)


def _cash_change(company, start, end):
	accounts = _cash_accounts(company)
	if not accounts:
		return 0.0
	v = frappe.db.sql(
		"""select sum(debit-credit) from `tabGL Entry` where company=%s and is_cancelled=0
		and account in %s and posting_date between %s and %s and is_opening!='Yes'
		and voucher_type!='Period Closing Voucher'""",
		(company, tuple(accounts), start, end),
	)[0][0]
	return flt(v)


def _row(rows, label):
	return next((r for r in rows if isinstance(r, dict) and _label(r.get("section")) == label), None)


class TestCashFlowReconciles(FrappeTestCase):
	def setUp(self):
		found = _company_with_gl()
		if not found:
			self.skipTest("No ledger entries on this site")
		self.company, _first, last = found
		fy = frappe.db.sql(
			"""select name, year_start_date, year_end_date from `tabFiscal Year`
			where %s between year_start_date and year_end_date and disabled=0 limit 1""",
			last,
		)
		if not fy:
			self.skipTest("No fiscal year for the latest entry")
		self.fy, self.fy_start, self.fy_end = fy[0]
		self.end = min(getdate(self.fy_end), getdate(last))

	def _filters(self, periodicity, accumulated, start=None):
		return {
			"company": self.company,
			"filter_based_on": "Date Range",
			"periodicity": periodicity,
			"from_fiscal_year": self.fy,
			"to_fiscal_year": self.fy,
			"period_start_date": str(start or self.fy_start),
			"period_end_date": str(self.end),
			"accumulated_values": 1 if accumulated else 0,
		}

	def _run(self, filters):
		return run_cash_flow(dict(filters))

	def test_net_change_matches_cash_accounts(self):
		# A range starting mid-year as well: ERPNext's own accumulated mode
		# mixes bases there.
		mid = getdate(self.fy_start).replace(month=min(getdate(self.end).month, 2), day=1)
		for start in (None, mid):
			for periodicity in ("Monthly", "Quarterly"):
				for accumulated in (False, True):
					self._check(self._filters(periodicity, accumulated, start), periodicity, accumulated)

	def _check(self, filters, periodicity, accumulated):
		result = self._run(filters)
		rows = result["result"]
		net = _row(rows, "Net Change in Cash")
		opening = _row(rows, "Opening Cash Balance")
		closing = _row(rows, "Closing Cash Balance")
		self.assertTrue(net and opening and closing)
		periods = _periods(frappe._dict(filters), result)
		for p in periods:
			# Running totals restart when the fiscal year changes.
			seg = [q for q in periods if q["fy_start"] == p["fy_start"]]
			start = seg[0]["from_date"] if accumulated else p["from_date"]
			expected = _cash_change(self.company, start, p["to_date"])
			tag = f"{periodicity}/{accumulated}/{p['key']}"
			self.assertAlmostEqual(flt(net[p["key"]]), expected, 2, tag)
			self.assertAlmostEqual(
				flt(opening[p["key"]]) + flt(net[p["key"]]), flt(closing[p["key"]]), 2, tag
			)

	def test_other_row_added_once(self):
		filters = self._filters("Monthly", False)
		result = self._run(filters)
		again = complete_cash_flow(result, dict(filters))
		others = [r for r in again["result"] if _row([r], OTHER_LABEL) or _row([r], frappe._(OTHER_LABEL))]
		self.assertEqual(len(others), 1)
		self.assertEqual(sum(1 for r in again["result"] if _row([r], "Opening Cash Balance")), 1)

	def test_run_report_completes_cash_flow(self):
		from taxmate.api.reports import run_report

		frappe.defaults.set_user_default("company", self.company)
		result = run_report("Cash Flow", self._filters("Monthly", False))
		self.assertTrue(_row(result["result"], "Opening Cash Balance"))


class TestTrialBalanceFilters(FrappeTestCase):
	def setUp(self):
		found = _company_with_gl()
		if not found:
			self.skipTest("No ledger entries on this site")
		self.company, _first, last = found
		frappe.defaults.set_user_default("company", self.company)
		self.fy = frappe.db.sql(
			"""select name, year_start_date, year_end_date from `tabFiscal Year`
			where %s between year_start_date and year_end_date and disabled=0 limit 1""",
			last,
		)
		if not self.fy:
			self.skipTest("No fiscal year")
		self.other_fy = frappe.db.get_value(
			"Fiscal Year", {"name": ["!=", self.fy[0][0]], "disabled": 0}, "name"
		)

	def test_closing_is_net_and_fiscal_year_follows_from_date(self):
		from taxmate.api.reports import run_report

		name, start, end = self.fy[0]
		result = run_report(
			"Trial Balance",
			{
				"company": self.company,
				# A different year on purpose: the server must pick the year of From Date.
				"fiscal_year": self.other_fy or name,
				"from_date": str(start),
				"to_date": str(end),
				"show_net_values": 1,
				"show_group_accounts": 0,
			},
		)
		rows = [r for r in result["result"] if r.get("account") and not str(r["account"]).startswith("'")]
		self.assertTrue(rows)
		for r in rows:
			self.assertEqual(str(r["from_date"]), str(start))
			self.assertFalse(flt(r["closing_debit"]) and flt(r["closing_credit"]), r["account"])
			self.assertFalse(r.get("is_group_account"), r["account"])
		total = next(r for r in result["result"] if str(r.get("account", "")).startswith("'Total"))
		self.assertAlmostEqual(flt(total["debit"]), flt(total["credit"]), 2)
