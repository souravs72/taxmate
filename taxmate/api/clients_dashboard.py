"""All-clients dashboard for an accountant or partner (design v1.3).

One row per company the signed-in user may open, plus the tile totals. It is a
thin aggregator: every figure comes from ``accountant_dashboard._Ctx``, which is
already per-company with one method per section, so this dashboard and a
client's own accountant dashboard cannot drift apart — they compute from the
same code.

Three rules this module keeps:

1. **Scope comes from ``user_companies()``**, never ``frappe.get_all("Company")``.
   That helper already honours User Permission on Company, so the moment those
   rows exist this endpoint narrows on its own, with no change here.
2. **One bad company must not blank the screen.** Each row is built inside a
   try/except; a company that raises comes back with ``error`` set and the rest
   of the dashboard still renders.
3. **Tile totals are counted from the returned rows**, using the same
   predicates the table filters by (``utils.client_status.TILES``). Counting
   them separately is how a tile ends up claiming a number its own filter
   cannot reproduce.

No wording is produced here. A row carries ``reason_key`` and ``reason``; the
SPA turns those into a sentence, because the app ships in English and Arabic.
"""

from __future__ import annotations

import time
from datetime import date
from typing import Any

import frappe
from frappe.utils import getdate, today

from taxmate.api.accountant_dashboard import _Ctx, month_options
from taxmate.api.resource import require_login
from taxmate.utils.client_status import (
	TILES,
	client_status,
	current_vat_period,
	overdue_total,
	sixty_plus_total,
)
from taxmate.utils.company import user_companies

_CT_LOG = "UAE CT Filing Log"


@frappe.whitelist()
def get_clients_dashboard(month: str | None = None, limit: int | None = None) -> dict[str, Any]:
	"""One summary row per permitted company, plus the tile totals.

	``month`` selects the accounting month for the close column (``YYYY-MM``),
	defaulting to the current one. ``limit`` caps the number of companies; it is
	unset by default because a practice would rather wait than silently not see
	a client, but it is there for a firm with a very large book.
	"""
	require_login()
	started = time.monotonic()

	on = getdate(today())
	months = month_options(on)
	month = month if month in months else months[-1]

	names = user_companies()
	truncated = False
	if limit and len(names) > int(limit):
		names = names[: int(limit)]
		truncated = True

	rows = []
	for company in names:
		rows.append(_row(company, on, month))

	elapsed_ms = int((time.monotonic() - started) * 1000)
	return {
		"today": str(on),
		"month": month,
		"months": months,
		"rows": rows,
		"totals": tile_totals(rows),
		"companies": len(rows),
		"truncated": truncated,
		# Built in on purpose: this is the measurement that decides whether a
		# cached Client Status Snapshot is needed at all (design doc v1.3,
		# "Measure before building the snapshot"). Read it from a real site
		# with a real book rather than guessing.
		"elapsed_ms": elapsed_ms,
	}


# ── One row ────────────────────────────────────────────────────────────────


def _row(company: str, on: date, month: str) -> dict[str, Any]:
	base = {"company": company, "label": company, "error": None}
	try:
		doc = _company_doc(company)
		meta = _public_meta(company, doc)
		ctx = _Ctx(company, on, month)

		vat = _vat(ctx, on, doc)
		close = _close(ctx)
		bank = _bank(ctx)
		fixes = _fixes(ctx)
		receivable = _receivable(ctx)
		einvoice = _einvoice(ctx, company)
		ct = _corporate_tax(company)

		status = client_status(
			on=on,
			vat_days=vat.get("days") if vat else None,
			vat_filed=bool(vat.get("filed")) if vat else False,
			einvoice_rejected=einvoice.get("rejected") if einvoice else None,
			einvoice_done=einvoice.get("done") if einvoice else None,
			einvoice_total=einvoice.get("total") if einvoice else None,
			close_done=close.get("done") if close else None,
			close_total=close.get("total") if close else None,
			close_month_end=getdate(close["end"]) if close and close.get("end") else None,
			bank_unreconciled=bank.get("unreconciled") if bank else None,
			fixes_count=fixes.get("count") if fixes else None,
		)

		return {
			**base,
			**meta,
			"status": status.status,
			"reason_key": status.reason_key,
			"reason": status.reason,
			"vat": vat,
			"close": close,
			"bank": bank,
			"fixes": fixes,
			"receivable": receivable,
			"einvoice": einvoice,
			"ct": ct,
		}
	except Exception:
		# Logged, not swallowed silently — but the other eleven clients still load.
		frappe.log_error(
			title=f"TaxMate clients dashboard row failed: {company}",
			message=frappe.get_traceback(),
		)
		return {**base, "error": "failed", "status": None, "reason_key": "row_failed", "reason": {}}


_SHIP1_FIELDS = (
	"taxmate_vat_filing_frequency",
	"taxmate_vat_first_period_start",
	"taxmate_assigned_accountant",
)


def _ship1_fields_present() -> list[str]:
	"""The Ship 1 Company fields that actually exist on this site.

	Reading a field that was never created raises, so this is checked the same
	way ``_Ctx`` checks ``accounts_frozen_till_date``. It means this endpoint
	still returns rows on a site where the fields have not been migrated yet —
	the VAT fallback and the Staff column simply come back empty instead of the
	whole dashboard failing.
	"""
	meta = frappe.get_meta("Company")
	return [f for f in _SHIP1_FIELDS if meta.has_field(f)]


def _company_doc(company: str) -> dict[str, Any]:
	fields = ["company_name", "tax_id", "default_currency", "country", "domain"]
	fields += _ship1_fields_present()
	return frappe.get_cached_value("Company", company, fields, as_dict=True) or {}


def _public_meta(company: str, doc: dict[str, Any]) -> dict[str, Any]:
	staff = None
	if doc.get("taxmate_assigned_accountant"):
		user = doc["taxmate_assigned_accountant"]
		staff = {
			"user": user,
			"full_name": frappe.get_cached_value("User", user, "full_name") or user,
		}
	return {
		"label": doc.get("company_name") or company,
		"trn": doc.get("tax_id"),
		"currency": doc.get("default_currency"),
		"country": doc.get("country"),
		# ERPNext's own Company.domain, already seeded by taxmate/setup/seed_books.py.
		"kind": doc.get("domain"),
		"emirate": _emirate(company),
		"staff": staff,
	}


def _emirate(company: str) -> str | None:
	"""The Emirate from the company's address — there is no field on Company.

	Same traversal ``uae.readiness._has_company_address_with_emirate`` uses.
	"""
	addresses = frappe.get_all(
		"Dynamic Link",
		filters={"link_doctype": "Company", "link_name": company, "parenttype": "Address"},
		pluck="parent",
		limit=5,
	)
	for name in addresses:
		emirate = frappe.db.get_value("Address", name, "emirate")
		if emirate:
			return emirate
	return None


# ── Sections ───────────────────────────────────────────────────────────────


def _vat(ctx: _Ctx, on: date, doc: dict[str, Any]) -> dict[str, Any] | None:
	"""The return now due. A filing log wins; otherwise compute from the field.

	``_Ctx.vat()`` returns ``None`` when VAT logs cannot be read, and
	``{"log": None}`` when no log covers the selected month.
	"""
	found = ctx.vat()
	if found is None:
		return None

	log = found.get("log")
	if log:
		return {
			"period_start": log.get("period_start"),
			"period_end": log.get("period_end"),
			"due_date": log.get("due_date"),
			"days": log.get("days"),
			"state": log.get("status"),
			"filed": bool(log.get("filed")),
			"from_log": True,
			"log": log.get("name"),
		}

	# No log yet. Work the period out from the company's filing frequency
	# (Ship 1). Absent or unset, the caller gets "not set up" rather than a
	# guessed date.
	period = current_vat_period(
		doc.get("taxmate_vat_filing_frequency"),
		_as_date(doc.get("taxmate_vat_first_period_start")),
		on,
	)
	if period is None:
		return {"from_log": False, "filed": False, "state": None, "days": None}
	return {
		"period_start": str(period.start),
		"period_end": str(period.end),
		"due_date": str(period.due),
		"days": (period.due - on).days,
		"state": "not_started",
		"filed": False,
		"from_log": False,
		"log": None,
	}


def _as_date(value) -> date | None:
	return getdate(value) if value else None


def _close(ctx: _Ctx) -> dict[str, Any] | None:
	data = ctx.close()
	if not data:
		return None
	return {
		"month": data.get("month"),
		"end": data.get("end"),
		"done": data.get("done"),
		"total": data.get("total"),
	}


def _bank(ctx: _Ctx) -> dict[str, Any] | None:
	"""Unmatched statement lines across the company's bank accounts.

	``_Ctx.banks()`` sets ``unreconciled`` to ``None``, not ``0``, for an account
	whose statement lines cannot be read. Those accounts are counted as unknown
	rather than folded in as zero, and if none could be read the total is
	``None`` so the screen shows "—".
	"""
	accounts = ctx.banks()
	if accounts is None:
		return None
	known = [a.get("unreconciled") for a in accounts if a.get("unreconciled") is not None]
	oldest = min(
		(a["reconciled_to"] for a in accounts if a.get("reconciled_to")),
		default=None,
	)
	return {
		"unreconciled": sum(known) if known else None,
		"accounts": len(accounts),
		"unreadable": len(accounts) - len(known),
		"reconciled_to": oldest,
	}


def _fixes(ctx: _Ctx) -> dict[str, Any] | None:
	data = ctx.fixes()
	if not data:
		return None
	checks = data.get("checks") or []
	top = next((c for c in checks if c.get("count")), None)
	return {
		"count": data.get("count") or 0,
		"since": data.get("since"),
		"top_key": top.get("key") if top else None,
		"top_count": top.get("count") if top else None,
	}


def _receivable(ctx: _Ctx) -> dict[str, Any] | None:
	data = ctx.party_ageing("Sales Invoice")
	if not data:
		return None
	buckets = ((data.get("total") or {}).get("buckets")) or None
	return {
		"outstanding": (data.get("total") or {}).get("total"),
		"overdue": overdue_total(buckets),
		"sixty_plus": sixty_plus_total(buckets),
		"parties": data.get("parties"),
	}


def _einvoice(ctx: _Ctx, company: str) -> dict[str, Any] | None:
	"""This month's e-invoice outcomes, plus setup readiness as done/total.

	Readiness is the existing ten-item checklist in ``uae.readiness`` — the
	denominator is read from it rather than hardcoded, so it follows the
	checklist if an item is ever added.
	"""
	month = ctx.einvoice() or {}
	done = total = None
	try:
		from taxmate.uae.readiness import get_uae_readiness_checklist

		check = get_uae_readiness_checklist(company)
		if check.get("applicable"):
			items = check.get("items") or []
			total = len(items)
			done = sum(1 for i in items if i.get("ok"))
	except Exception:
		# A readiness failure must not cost us the rest of the row.
		frappe.log_error(
			title=f"TaxMate clients dashboard readiness failed: {company}",
			message=frappe.get_traceback(),
		)

	if not month and done is None:
		return None
	return {
		"done": done,
		"total": total,
		"accepted": month.get("accepted"),
		"pending": month.get("pending"),
		"rejected": month.get("rejected"),
		"failed": month.get("failed"),
	}


def _corporate_tax(company: str) -> dict[str, Any] | None:
	"""The open CT filing with the nearest due date, else the latest one.

	The UAE CT Filing Log already carries ``period_start``, ``period_end`` and
	``filing_due_date``, so no financial-year field is needed. A company with no
	log returns ``None``, which the screen shows as blank — a more useful signal
	than a date computed from an assumption.
	"""
	if not frappe.db.exists("DocType", _CT_LOG):
		return None
	if not frappe.has_permission(_CT_LOG, "read"):
		return None
	rows = frappe.get_list(
		_CT_LOG,
		filters=[["company", "=", company], ["docstatus", "<", 2]],
		fields=["name", "period_start", "period_end", "filing_due_date", "status", "deadline_status"],
		order_by="period_end desc",
		limit=6,
	)
	if not rows:
		return None
	open_rows = [r for r in rows if r.get("status") != "Filed" and r.get("filing_due_date")]
	pick = min(open_rows, key=lambda r: getdate(r["filing_due_date"])) if open_rows else rows[0]
	return {
		"log": pick.get("name"),
		"period_start": pick.get("period_start"),
		"period_end": pick.get("period_end"),
		"due_date": pick.get("filing_due_date"),
		"state": pick.get("status"),
		"deadline_state": pick.get("deadline_status"),
	}


# ── Tile totals ────────────────────────────────────────────────────────────


def tile_totals(rows: list[dict]) -> dict[str, Any]:
	"""Counted from the rows, with the predicates the table filters by.

	Each tile reports the number of clients behind it plus the headline figure
	the canvas shows. ``clients`` is the number the tile's own filter returns —
	asserted in ``test_clients_dashboard`` so the two can never disagree.
	"""
	live = [r for r in rows if not r.get("error")]

	def count(key: str) -> int:
		return sum(1 for r in live if TILES[key](r))

	def total(path: tuple[str, str]) -> float:
		head, leaf = path
		return round(sum((r.get(head) or {}).get(leaf) or 0 for r in live), 2)

	status_counts = {"bad": 0, "warn": 0, "ok": 0}
	for r in live:
		if r.get("status") in status_counts:
			status_counts[r["status"]] += 1

	return {
		"vat": {"clients": count("vat")},
		"bank": {"clients": count("bank"), "lines": int(total(("bank", "unreconciled")))},
		"einvoice": {"clients": count("einvoice")},
		"receivables": {
			"clients": count("receivables"),
			"overdue": total(("receivable", "overdue")),
			"sixty_plus": total(("receivable", "sixty_plus")),
		},
		"close": {
			"clients": count("close"),
			"closed": sum(
				1
				for r in live
				if (r.get("close") or {}).get("done") is not None
				and (r.get("close") or {}).get("done") == (r.get("close") or {}).get("total")
			),
			"of": len(live),
		},
		"status": status_counts,
		"failed": len(rows) - len(live),
	}
