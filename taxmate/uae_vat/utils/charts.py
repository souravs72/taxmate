"""Chart payloads for UAE VAT 201, e-invoicing, and filing queues.

Amounts are AED (FTA filing currency). One VAT 201 per company per period.
E-invoice mix follows the FTA pipeline, not raw ASP statuses.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

E_INVOICE_BUCKETS: tuple[tuple[str, tuple[str, ...]], ...] = (
	("In progress", ("Draft", "Generated", "Queued")),
	("With FTA", ("Submitted",)),
	("Accepted", ("Accepted",)),
	("Action needed", ("Rejected", "Failed")),
)

FILING_QUEUE_ORDER = ("Overdue", "Due", "Upcoming")
VAT_201_PERIOD_LIMIT = 8


def period_label(period_start: date | str, period_end: date | str) -> str:
	"""VAT 201 axis label: Qn YYYY for quarters, Mon YYYY for months."""
	start = _as_date(period_start)
	end = _as_date(period_end)
	span = (end - start).days + 1
	if 80 <= span <= 100:
		return f"Q{(end.month - 1) // 3 + 1} {end.year}"
	if 27 <= span <= 31:
		return end.strftime("%b %Y")
	return f"{start.strftime('%d %b')}-{end.strftime('%d %b %Y')}"


def select_vat_201_filings(
	rows: list[dict[str, Any]], limit: int = VAT_201_PERIOD_LIMIT
) -> list[dict[str, Any]]:
	"""One live filing per period_end. Submitted beats draft; cancelled dropped."""
	by_period: dict[str, dict[str, Any]] = {}
	for row in rows:
		if int(row.get("docstatus") or 0) == 2:
			continue
		key = str(row.get("period_end") or "")
		if not key:
			continue
		prev = by_period.get(key)
		if prev is None or _better_filing(row, prev):
			by_period[key] = row
	ordered = sorted(by_period.values(), key=lambda row: _as_date(row["period_end"]))
	return ordered[-limit:]


def vat_201_net_due_chart(rows: list[dict[str, Any]]) -> dict[str, Any]:
	"""Bar: Box 14 net VAT due. Positive = payable to FTA, negative = refundable."""
	labels = [period_label(row["period_start"], row["period_end"]) for row in rows]
	values = [round(float(row.get("net_vat_due") or 0), 2) for row in rows]
	return {
		"labels": labels,
		"datasets": [{"name": "Net VAT due (AED)", "values": values}],
	}


def e_invoice_status_chart(status_counts: dict[str, int]) -> dict[str, Any]:
	"""Donut of live e-invoices. Cancelled is omitted. Empty if nothing live."""
	labels: list[str] = []
	values: list[int] = []
	for label, statuses in E_INVOICE_BUCKETS:
		total = sum(int(status_counts.get(status) or 0) for status in statuses)
		labels.append(label)
		values.append(total)
	if not any(values):
		return {"labels": [], "datasets": [{"name": "E-invoices", "values": []}]}
	return {"labels": labels, "datasets": [{"name": "E-invoices", "values": values}]}


def filing_queue_chart(status_counts: dict[str, int]) -> dict[str, Any]:
	"""Open filings by urgency. Filed/Cleared are done and stay off the queue."""
	labels = list(FILING_QUEUE_ORDER)
	values = [int(status_counts.get(status) or 0) for status in FILING_QUEUE_ORDER]
	if not any(values):
		return {"labels": [], "datasets": [{"name": "Open filings", "values": []}]}
	return {"labels": labels, "datasets": [{"name": "Open filings", "values": values}]}


def _better_filing(row: dict[str, Any], prev: dict[str, Any]) -> bool:
	row_status = int(row.get("docstatus") or 0)
	prev_status = int(prev.get("docstatus") or 0)
	if row_status != prev_status:
		return row_status > prev_status
	return str(row.get("modified") or "") > str(prev.get("modified") or "")


def _as_date(value: date | datetime | str) -> date:
	if isinstance(value, datetime):
		return value.date()
	if isinstance(value, date):
		return value
	return date.fromisoformat(str(value)[:10])


def resolve_chart_company(filters) -> str | None:
	"""Company from chart filters, only if the user can read that Company."""
	import frappe

	parsed = frappe.parse_json(filters) if filters else {}
	company = parsed.get("company") if isinstance(parsed, dict) else None
	company = company or frappe.defaults.get_user_default("Company")
	if not company or not frappe.db.exists("Company", company):
		return None
	if not frappe.has_permission("Company", "read", doc=company):
		return None
	return company


def count_by_field(doctype: str, filters: dict[str, Any], field: str) -> dict[str, int]:
	"""Permission-aware GROUP BY counts (Frappe get_list, not get_all)."""
	import frappe

	counts: dict[str, int] = {}
	for row in frappe.get_list(
		doctype,
		filters=filters,
		fields=[field, {"COUNT": "*", "as": "cnt"}],
		group_by=field,
		order_by=field,
		limit=50,
	):
		key = row.get(field)
		if key:
			counts[str(key)] = int(row.get("cnt") or 0)
	return counts


def translate_chart(chart: dict[str, Any]) -> dict[str, Any]:
	"""Translate axis labels and dataset names the way ERPNext custom sources do."""
	from frappe import _

	return {
		"labels": [_(label) for label in chart.get("labels") or []],
		"datasets": [
			{"name": _(dataset.get("name") or ""), "values": dataset.get("values") or []}
			for dataset in chart.get("datasets") or []
		],
	}
