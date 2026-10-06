"""Status rules and VAT period maths for the All-clients (CA) dashboard.

Deliberately free of ``frappe``: every function here is pure, so the rules can
be unit-tested without a site, the way ``age_bucket`` and ``month_options``
already are. All database work lives in ``taxmate.api.clients_dashboard``,
which feeds this module plain values.

Two conventions worth knowing before changing anything here:

1. **No user-facing English.** ``client_status`` returns a reason *key* and its
   parameters, never a sentence. The SPA owns the wording (``i18n/strings.ts``)
   because the app ships in English and Arabic. A sentence built here could not
   be translated.
2. **``None`` is not zero.** A signal that could not be read arrives as
   ``None`` and is treated as "unknown", never as "nothing to do". A zero on a
   dashboard reads as a real figure.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, NamedTuple

# ── Thresholds ─────────────────────────────────────────────────────────────
# Hardcoded for v1 by decision (claude/ca-my-clients-design.md v1.3). When a
# firm wants these configurable they move to TaxMate Settings; they are named
# rather than inlined so that change touches one place.
VAT_DUE_SOON_DAYS = 14
"""A VAT return due within this many days is "due soon"."""

CLOSE_LATE_DAYS = 15
"""A month still open this many days after it ended is "overdue"."""

BANK_LINES_PILING = 20
"""Unmatched bank lines at or above this count count as work piling up."""

FIXES_PILING = 5
"""Data fixes at or above this count count as work piling up."""

VAT_DUE_DAY = 28
"""FTA: a VAT 201 is due on the 28th of the month after the period ends."""

STATUS_OVERDUE = "bad"
STATUS_DUE_SOON = "warn"
STATUS_ON_TRACK = "ok"

MONTHLY = "Monthly"
QUARTERLY = "Quarterly"

# Mirrors ``taxmate.api.owner_dashboard.AGE_BUCKETS``. Not imported, because
# that module pulls in frappe and this one must not. test_clients_dashboard
# asserts the two still agree, so a change there fails loudly here.
AGE_BUCKETS = ("current", "1_30", "31_60", "61_90", "90_plus")
_OVERDUE_FROM = 1  # "1_30" onward is past due
_SIXTY_PLUS_FROM = 3  # "61_90" onward is more than 60 days late


# ── Date helpers (pure) ────────────────────────────────────────────────────


def _last_day_of(year: int, month: int) -> int:
	nxt = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
	return (nxt - timedelta(days=1)).day


def add_months(d: date, n: int) -> date:
	"""``frappe.utils.add_months`` without frappe. Clamps to the month's length."""
	total = d.month - 1 + n
	year = d.year + total // 12
	month = total % 12 + 1
	return date(year, month, min(d.day, _last_day_of(year, month)))


def vat_due_date(period_end: date) -> date:
	"""The 28th of the month following ``period_end``."""
	first_of_next = add_months(date(period_end.year, period_end.month, 1), 1)
	return first_of_next.replace(day=VAT_DUE_DAY)


class VatPeriod(NamedTuple):
	start: date
	end: date
	due: date


def current_vat_period(
	frequency: str | None,
	first_period_start: date | None,
	on: date,
) -> VatPeriod | None:
	"""The period whose return is now due — the latest one that has fully ended.

	Used only when no UAE VAT 201 Filing Log exists for the company yet. When a
	log does exist it is the source of truth and this is not consulted: the log
	carries the real ``period_start``, ``period_end`` and ``filing_due_date``.

	Returns ``None`` when the frequency is unset, when a quarterly company has
	no stagger date, or when the first period has not ended yet — all of which
	the caller shows as "not set up" rather than guessing.
	"""
	if not frequency:
		return None

	if frequency == MONTHLY:
		end = date(on.year, on.month, 1) - timedelta(days=1)
		start = date(end.year, end.month, 1)
		return VatPeriod(start, end, vat_due_date(end))

	if frequency == QUARTERLY:
		if not first_period_start:
			return None
		anchor = date(first_period_start.year, first_period_start.month, 1)
		if anchor > on:
			return None
		# Jump straight to the right quarter rather than looping from the anchor.
		elapsed = (on.year - anchor.year) * 12 + (on.month - anchor.month)
		start = add_months(anchor, (elapsed // 3) * 3)
		end = add_months(start, 3) - timedelta(days=1)
		if end > on:
			start = add_months(start, -3)
			if start < anchor:
				return None
			end = add_months(start, 3) - timedelta(days=1)
		return VatPeriod(start, end, vat_due_date(end))

	return None


# ── Ageing ─────────────────────────────────────────────────────────────────


def overdue_total(buckets: list[float] | None) -> float | None:
	"""Everything past due: the ageing buckets after ``current``."""
	if not buckets:
		return None
	return round(sum(buckets[_OVERDUE_FROM:]), 2)


def sixty_plus_total(buckets: list[float] | None) -> float | None:
	"""More than 60 days late: ``61_90`` plus ``90_plus``."""
	if not buckets:
		return None
	return round(sum(buckets[_SIXTY_PLUS_FROM:]), 2)


# ── Status ─────────────────────────────────────────────────────────────────


class ClientStatus(NamedTuple):
	status: str
	reason_key: str
	reason: dict[str, Any]


def client_status(
	*,
	on: date,
	vat_days: int | None = None,
	vat_filed: bool = False,
	einvoice_rejected: int | None = None,
	einvoice_done: int | None = None,
	einvoice_total: int | None = None,
	close_done: int | None = None,
	close_total: int | None = None,
	close_month_end: date | None = None,
	bank_unreconciled: int | None = None,
	fixes_count: int | None = None,
) -> ClientStatus:
	"""Overdue / Due soon / On track, with the reason that decided it.

	Checked most severe first, and the first hit wins — a client is shown the
	single most urgent thing about them, not a list. ``reason_key`` is a
	translation key; ``reason`` carries its parameters.

	Every signal is optional. A ``None`` signal is unknown and never triggers a
	status, so a client whose bank feed cannot be read does not silently read
	as "On track".
	"""
	month_open = close_done is not None and close_total is not None and close_done < close_total

	# ── Overdue ──
	if not vat_filed and vat_days is not None and vat_days < 0:
		return ClientStatus(STATUS_OVERDUE, "vat_overdue", {"days": abs(vat_days)})

	if einvoice_rejected:
		return ClientStatus(STATUS_OVERDUE, "einvoice_rejected", {"count": einvoice_rejected})

	if month_open and close_month_end is not None:
		late = (on - close_month_end).days
		if late >= CLOSE_LATE_DAYS:
			return ClientStatus(
				STATUS_OVERDUE,
				"close_late",
				{"days": late, "done": close_done, "total": close_total},
			)

	# ── Due soon ──
	if not vat_filed and vat_days is not None and vat_days <= VAT_DUE_SOON_DAYS:
		return ClientStatus(STATUS_DUE_SOON, "vat_due_soon", {"days": vat_days})

	if einvoice_done is not None and einvoice_total and einvoice_done < einvoice_total:
		return ClientStatus(
			STATUS_DUE_SOON,
			"einvoice_not_ready",
			{"done": einvoice_done, "total": einvoice_total},
		)

	if bank_unreconciled is not None and bank_unreconciled >= BANK_LINES_PILING:
		return ClientStatus(STATUS_DUE_SOON, "bank_backlog", {"count": bank_unreconciled})

	if fixes_count is not None and fixes_count >= FIXES_PILING:
		return ClientStatus(STATUS_DUE_SOON, "fixes_backlog", {"count": fixes_count})

	# ── On track ──
	return ClientStatus(STATUS_ON_TRACK, "nothing_due", {"days": VAT_DUE_SOON_DAYS})


# ── Tile predicates ────────────────────────────────────────────────────────
# One definition per tile, used BOTH to count the tile and to filter the table.
# They live together so a tile can never claim a number its own filter cannot
# reproduce — the failure mode that makes a dashboard untrustworthy.


def tile_vat(row: dict) -> bool:
	vat = row.get("vat") or {}
	days = vat.get("days")
	return not vat.get("filed") and days is not None and days <= VAT_DUE_SOON_DAYS


def tile_bank(row: dict) -> bool:
	return bool((row.get("bank") or {}).get("unreconciled"))


def tile_einvoice(row: dict) -> bool:
	e = row.get("einvoice") or {}
	return e.get("done") is not None and bool(e.get("total")) and e["done"] < e["total"]


def tile_receivables(row: dict) -> bool:
	return bool((row.get("receivable") or {}).get("overdue"))


def tile_close(row: dict) -> bool:
	c = row.get("close") or {}
	return c.get("done") is not None and c.get("total") is not None and c["done"] < c["total"]


TILES = {
	"vat": tile_vat,
	"bank": tile_bank,
	"einvoice": tile_einvoice,
	"receivables": tile_receivables,
	"close": tile_close,
}
