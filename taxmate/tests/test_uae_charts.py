"""UAE tax dashboard chart aggregations (pure helpers + Home layout).

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_uae_charts
"""

from __future__ import annotations

import json
import unittest
from datetime import date

from taxmate.setup.home import build_home_content
from taxmate.uae_vat.utils.charts import (
	e_invoice_status_chart,
	filing_queue_chart,
	period_label,
	select_vat_201_filings,
	vat_201_net_due_chart,
)


class TestPeriodLabel(unittest.TestCase):
	def test_quarterly_vat_period(self):
		self.assertEqual(period_label(date(2026, 1, 1), date(2026, 3, 31)), "Q1 2026")
		self.assertEqual(period_label(date(2026, 10, 1), date(2026, 12, 31)), "Q4 2026")

	def test_monthly_vat_period(self):
		self.assertEqual(period_label(date(2026, 4, 1), date(2026, 4, 30)), "Apr 2026")


class TestVat201NetDue(unittest.TestCase):
	def test_submitted_beats_draft_same_period(self):
		rows = [
			{
				"period_start": "2026-01-01",
				"period_end": "2026-03-31",
				"net_vat_due": 100,
				"docstatus": 0,
				"modified": "2026-04-10",
			},
			{
				"period_start": "2026-01-01",
				"period_end": "2026-03-31",
				"net_vat_due": 250,
				"docstatus": 1,
				"modified": "2026-04-01",
			},
			{
				"period_start": "2025-10-01",
				"period_end": "2025-12-31",
				"net_vat_due": 80,
				"docstatus": 1,
				"modified": "2026-01-05",
			},
			{
				"period_start": "2026-01-01",
				"period_end": "2026-03-31",
				"net_vat_due": 999,
				"docstatus": 2,
				"modified": "2026-04-11",
			},
		]
		picked = select_vat_201_filings(rows)
		self.assertEqual([row["net_vat_due"] for row in picked], [80, 250])

	def test_chart_is_chronological_aed_bars(self):
		picked = select_vat_201_filings(
			[
				{
					"period_start": "2026-04-01",
					"period_end": "2026-06-30",
					"net_vat_due": -40,
					"docstatus": 1,
					"modified": "2026-07-01",
				},
				{
					"period_start": "2026-01-01",
					"period_end": "2026-03-31",
					"net_vat_due": 120,
					"docstatus": 1,
					"modified": "2026-04-01",
				},
			]
		)
		chart = vat_201_net_due_chart(picked)
		self.assertEqual(chart["labels"], ["Q1 2026", "Q2 2026"])
		self.assertEqual(chart["datasets"][0]["values"], [120.0, -40.0])
		self.assertEqual(chart["datasets"][0]["name"], "Net VAT due (AED)")

	def test_box_14_is_rounded_to_aed_fils(self):
		chart = vat_201_net_due_chart(
			[
				{
					"period_start": "2026-01-01",
					"period_end": "2026-03-31",
					"net_vat_due": 120.456,
					"docstatus": 1,
					"modified": "2026-04-01",
				}
			]
		)
		self.assertEqual(chart["datasets"][0]["values"], [120.46])


class TestEInvoiceStatusChart(unittest.TestCase):
	def test_buckets_fta_pipeline_and_stable_order(self):
		chart = e_invoice_status_chart(
			{
				"Draft": 2,
				"Queued": 1,
				"Submitted": 4,
				"Accepted": 10,
				"Rejected": 1,
				"Failed": 2,
				"Cancelled": 9,
			}
		)
		self.assertEqual(
			chart["labels"],
			["In progress", "With FTA", "Accepted", "Action needed"],
		)
		self.assertEqual(chart["datasets"][0]["values"], [3, 4, 10, 3])
		self.assertNotIn("Cancelled", chart["labels"])

	def test_empty_when_no_live_invoices(self):
		chart = e_invoice_status_chart({"Cancelled": 4})
		self.assertEqual(chart["labels"], [])
		self.assertEqual(chart["datasets"][0]["values"], [])


class TestFilingQueueChart(unittest.TestCase):
	def test_urgency_order_excludes_filed(self):
		chart = filing_queue_chart({"Filed": 5, "Cleared": 2, "Overdue": 3, "Due": 1, "Upcoming": 4})
		self.assertEqual(chart["labels"], ["Overdue", "Due", "Upcoming"])
		self.assertEqual(chart["datasets"][0]["values"], [3, 1, 4])


class TestHomeChartLayout(unittest.TestCase):
	def test_charts_sit_between_kpis_and_daily_work(self):
		content = build_home_content(
			number_card_labels=["Draft VAT 201"],
			daily_shortcut_labels=["Sales Invoice"],
			uae_shortcut_labels=["VAT 201"],
			card_names=["UAE VAT"],
			chart_layout=[
				("VAT 201 Net Due", 12),
				("E-Invoice Status", 6),
				("Filing Queue", 6),
			],
		)
		blocks = json.loads(content)
		types = [block["type"] for block in blocks]
		self.assertIn("chart", types)
		self.assertLess(types.index("number_card"), types.index("chart"))
		self.assertLess(types.index("chart"), types.index("shortcut"))
		chart_cols = [block["data"]["col"] for block in blocks if block["type"] == "chart"]
		self.assertEqual(chart_cols, [12, 6, 6])


try:
	import frappe
	from frappe.tests.utils import FrappeTestCase
except Exception:  # pragma: no cover
	frappe = None
	FrappeTestCase = unittest.TestCase


class TestUaeChartsSite(FrappeTestCase):
	def test_dashboard_and_home_charts_install(self):
		if not getattr(frappe, "local", None) or not getattr(frappe.local, "site", None):
			self.skipTest("No Frappe site")
		from taxmate.setup.home import ensure_uae_home_workspace

		ensure_uae_home_workspace()

		for name in ("VAT 201 Net Due", "E-Invoice Status", "Filing Queue"):
			self.assertTrue(frappe.db.exists("Dashboard Chart", name), name)
		self.assertTrue(frappe.db.exists("Dashboard", "UAE Tax"))

		if frappe.db.exists("Workspace", "Home"):
			home = frappe.get_doc("Workspace", "Home")
			self.assertIn("VAT 201 Net Due", home.content or "")
			chart_names = {row.chart_name for row in home.charts}
			self.assertIn("VAT 201 Net Due", chart_names)

		chart = frappe.get_doc("Dashboard Chart", "VAT 201 Net Due")
		self.assertTrue({row.role for row in chart.roles} & {"Accounts User", "UAE Tax Manager", "System Manager"})
		self.assertIn('"fieldtype": "Currency"', chart.custom_options or "")
		self.assertIn('"options": "AED"', chart.custom_options or "")
		if frappe.db.exists("Currency", "AED"):
			self.assertEqual(chart.currency, "AED")
		for source in ("VAT 201 Net Due", "E-Invoice Status", "Filing Queue"):
			self.assertTrue(frappe.db.exists("Dashboard Chart Source", source), source)

		from taxmate.uae_vat.utils.charts import resolve_chart_company

		self.assertIsNone(resolve_chart_company({"company": "__no_such_company__"}))

		import inspect

		from taxmate.uae_e_invoicing.dashboard_chart_source.e_invoice_status.e_invoice_status import (
			get as einv_get,
		)
		from taxmate.uae_vat.dashboard_chart_source.filing_queue.filing_queue import get as queue_get
		from taxmate.uae_vat.dashboard_chart_source.vat_201_net_due.vat_201_net_due import get as vat_get

		for getter in (vat_get, einv_get, queue_get):
			out = inspect.unwrap(getter)(filters={"company": "__no_such_company__"})
			self.assertEqual(out["labels"], [])
			self.assertIn("datasets", out)

		company = frappe.defaults.get_user_default("Company")
		if not company or not frappe.db.exists("Company", company):
			return
		for getter in (vat_get, einv_get, queue_get):
			out = inspect.unwrap(getter)(filters={"company": company})
			self.assertIn("labels", out)
			self.assertIn("datasets", out)
