"""All-clients dashboard endpoint — shape, scoping, and the tile invariant.

The rules themselves are tested without a site in
``taxmate.tests.test_client_status``. This file covers what only a site can
answer: that the endpoint runs, that it is scoped by User Permission, and that
every tile total equals the number of rows its own filter returns.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_clients_dashboard
"""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import resource
from taxmate.api.clients_dashboard import get_clients_dashboard, tile_totals
from taxmate.utils.client_status import AGE_BUCKETS, TILES
from taxmate.utils.company import user_companies

_SHIP1_FIELDS = (
	"taxmate_vat_filing_frequency",
	"taxmate_vat_first_period_start",
	"taxmate_assigned_accountant",
)


class TestClientsDashboard(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.payload = get_clients_dashboard()

	# ── Ship 1 ──

	def test_the_company_fields_were_migrated(self):
		meta = frappe.get_meta("Company")
		missing = [f for f in _SHIP1_FIELDS if not meta.has_field(f)]
		self.assertEqual(missing, [], "run `bench migrate` — Ship 1 fields are not on Company")

	# ── Shape ──

	def test_payload_shape(self):
		for key in ("today", "month", "months", "rows", "totals", "companies", "elapsed_ms"):
			self.assertIn(key, self.payload)
		self.assertIsInstance(self.payload["rows"], list)
		self.assertEqual(self.payload["companies"], len(self.payload["rows"]))

	def test_every_row_carries_a_translatable_reason(self):
		"""The backend returns a key and parameters, never an English sentence."""
		for row in self.payload["rows"]:
			self.assertTrue(row.get("reason_key"), f"{row['company']} has no reason_key")
			self.assertIsInstance(row.get("reason"), dict)
			self.assertIn(row.get("status"), ("bad", "warn", "ok", None))

	def test_a_failed_row_does_not_sink_the_others(self):
		for row in self.payload["rows"]:
			if row.get("error"):
				self.assertIsNone(row.get("status"))
				self.assertEqual(row.get("reason_key"), "row_failed")

	# ── Scoping ──

	def test_rows_come_from_user_companies(self):
		"""Scope must come from the helper that honours User Permission."""
		permitted = set(user_companies())
		returned = {r["company"] for r in self.payload["rows"]}
		self.assertTrue(
			returned.issubset(permitted),
			f"returned companies outside the permitted set: {returned - permitted}",
		)

	def test_a_company_the_user_cannot_read_is_omitted(self):
		"""A forged or revoked company must not appear, even inside the helper's list."""
		names = user_companies()
		if not names:
			self.skipTest("no companies")
		blocked = names[0]
		real = resource.can_use_company

		def gate(company, user=None):
			if company == blocked:
				return False
			return real(company, user)

		with patch.object(resource, "can_use_company", gate):
			payload = get_clients_dashboard()
		self.assertNotIn(blocked, {r["company"] for r in payload["rows"]})

	def test_limit_caps_and_flags(self):
		if len(self.payload["rows"]) < 2:
			self.skipTest("needs at least two companies")
		capped = get_clients_dashboard(limit=1)
		self.assertEqual(len(capped["rows"]), 1)
		self.assertTrue(capped["truncated"])
		self.assertFalse(self.payload["truncated"])

	def test_a_bad_limit_is_rejected(self):
		self.assertRaises(frappe.ValidationError, lambda: get_clients_dashboard(limit="nope"))

	# ── The invariant that makes the tiles trustworthy ──

	def test_every_tile_total_equals_its_own_filter(self):
		rows = self.payload["rows"]
		totals = self.payload["totals"]
		live = [r for r in rows if not r.get("error")]
		for key, predicate in TILES.items():
			expected = sum(1 for r in live if predicate(r))
			self.assertEqual(
				totals[key]["clients"],
				expected,
				f"the {key} tile claims {totals[key]['clients']} clients but its filter returns {expected}",
			)

	def test_status_counts_add_up(self):
		live = [r for r in self.payload["rows"] if not r.get("error")]
		counts = self.payload["totals"]["status"]
		self.assertEqual(sum(counts.values()), len(live))

	def test_tile_totals_on_a_handmade_set(self):
		"""The invariant holds on rows we control, not only on site data."""
		rows = [
			{"vat": {"days": 3, "filed": False}, "bank": {"unreconciled": 40}},
			{"vat": {"days": 3, "filed": True}, "bank": {"unreconciled": 0}},
			{"close": {"done": 4, "total": 8}, "receivable": {"overdue": 100.0}},
			{"einvoice": {"done": 8, "total": 10}},
			{"error": "failed"},
		]
		totals = tile_totals(rows)
		self.assertEqual(totals["vat"]["clients"], 1)
		self.assertEqual(totals["bank"]["clients"], 1)
		self.assertEqual(totals["bank"]["lines"], 40)
		self.assertEqual(totals["close"]["clients"], 1)
		self.assertEqual(totals["receivables"]["clients"], 1)
		self.assertEqual(totals["receivables"]["overdue"], 100.0)
		self.assertEqual(totals["einvoice"]["clients"], 1)
		self.assertEqual(totals["failed"], 1)

	# ── "None is not zero" survives all the way out ──

	def test_unknown_bank_lines_stay_null(self):
		for row in self.payload["rows"]:
			bank = row.get("bank")
			if bank and bank.get("unreadable") and not bank.get("accounts", 0) - bank["unreadable"]:
				self.assertIsNone(
					bank["unreconciled"],
					f"{row['company']}: unreadable bank lines came back as a number",
				)

	def test_readiness_denominator_is_not_hardcoded(self):
		"""The e-invoicing total follows uae.readiness, which has ten items."""
		from taxmate.uae.readiness import get_uae_readiness_checklist

		for row in self.payload["rows"]:
			e = row.get("einvoice")
			if not e or e.get("total") is None:
				continue
			check = get_uae_readiness_checklist(row["company"])
			self.assertEqual(e["total"], len(check["items"]))
			self.assertLessEqual(e["done"], e["total"])

	# ── Ship 2a: the 60+ invoice count and the published thresholds ──

	def test_sixty_plus_invoice_count_is_present_and_sane(self):
		for row in self.payload["rows"]:
			recv = row.get("receivable")
			if not recv:
				continue
			self.assertIn("sixty_plus_invoices", recv)
			n = recv["sixty_plus_invoices"]
			if n is None:
				continue
			self.assertGreaterEqual(n, 0)
			# A count without money, or money without a count, means the two
			# queries disagree about what "60+ days late" is.
			if n > 0:
				self.assertTrue(
					recv.get("sixty_plus"),
					f"{row['company']}: {n} invoices 60+ days late but no amount",
				)

	def test_receivables_tile_count_is_the_sum_of_the_rows(self):
		live = [r for r in self.payload["rows"] if not r.get("error")]
		expected = sum((r.get("receivable") or {}).get("sixty_plus_invoices") or 0 for r in live)
		self.assertEqual(self.payload["totals"]["receivables"]["sixty_plus_invoices"], expected)

	def test_thresholds_come_from_client_status(self):
		"""The SPA reads these; nothing may hardcode them on either side."""
		from taxmate.api.accountant_dashboard import LATE_DAYS
		from taxmate.utils import client_status as cs

		self.assertEqual(
			self.payload["thresholds"],
			{
				"vat_due_soon_days": cs.VAT_DUE_SOON_DAYS,
				"close_late_days": cs.CLOSE_LATE_DAYS,
				"bank_lines_piling": cs.BANK_LINES_PILING,
				"fixes_piling": cs.FIXES_PILING,
				"receivable_late_days": LATE_DAYS,
			},
		)

	def test_late_invoices_matches_the_queue_it_came_from(self):
		"""queues()['late'] and late_invoices() must stay the same figure."""
		from frappe.utils import getdate, today

		from taxmate.api.accountant_dashboard import _Ctx, month_options

		on = getdate(today())
		for row in self.payload["rows"][:3]:
			if row.get("error"):
				continue
			ctx = _Ctx(row["company"], on, month_options(on)[-1])
			self.assertEqual(ctx.queues()["late"], ctx.late_invoices())

	def test_every_row_is_tagged_with_its_tiles(self):
		"""The SPA filters on row["tiles"]; it must agree with the predicates."""
		for row in self.payload["rows"]:
			self.assertIsInstance(row.get("tiles"), list)
			if row.get("error"):
				self.assertEqual(row["tiles"], [])
				continue
			expected = sorted(k for k, fn in TILES.items() if fn(row))
			self.assertEqual(sorted(row["tiles"]), expected, row["company"])

	def test_tile_totals_equal_the_rows_tagged_with_that_tile(self):
		"""Counting two ways must give one answer."""
		live = [r for r in self.payload["rows"] if not r.get("error")]
		for key in TILES:
			tagged = sum(1 for r in live if key in (r.get("tiles") or []))
			self.assertEqual(self.payload["totals"][key]["clients"], tagged, key)

	def test_rows_arrive_most_urgent_first(self):
		order = {"bad": 0, "warn": 1, "ok": 2}
		seen = [order.get(r.get("status"), 8) for r in self.payload["rows"] if not r.get("error")]
		self.assertEqual(seen, sorted(seen), "rows are not ordered worst status first")

	def test_late_days_is_published(self):
		from taxmate.api.accountant_dashboard import LATE_DAYS

		self.assertEqual(self.payload["thresholds"]["receivable_late_days"], LATE_DAYS)

	# ── Drift ──

	def test_age_bucket_names_match_the_owner_dashboard(self):
		"""client_status mirrors this tuple rather than importing it (no frappe)."""
		from taxmate.api.owner_dashboard import AGE_BUCKETS as SOURCE

		self.assertEqual(
			tuple(AGE_BUCKETS),
			tuple(SOURCE),
			"owner_dashboard.AGE_BUCKETS changed — update utils/client_status.py",
		)

	# ── The measurement that decides the snapshot question ──

	def test_report_elapsed(self):
		ms = self.payload["elapsed_ms"]
		self.assertIsInstance(ms, int)
		print(
			f"\n[clients dashboard] {self.payload['companies']} companies in {ms} ms"
			f" ({ms / max(self.payload['companies'], 1):.0f} ms each)."
			"\n  under ~3000 ms total -> ship live, skip the Client Status Snapshot."
			"\n  10000 ms+           -> build the snapshot (design doc v1.3)."
		)
