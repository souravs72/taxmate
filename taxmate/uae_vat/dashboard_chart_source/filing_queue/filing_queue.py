"""Open UAE filings by urgency (VAT 201 + CT/ESR notices)."""

from __future__ import annotations

import frappe
from frappe.utils.dashboard import cache_source

from taxmate.uae_vat.utils.charts import (
	FILING_QUEUE_ORDER,
	count_by_field,
	filing_queue_chart,
	resolve_chart_company,
	translate_chart,
)


@frappe.whitelist()
@cache_source
def get(
	chart_name=None,
	chart=None,
	no_cache=None,
	filters=None,
	from_date=None,
	to_date=None,
	timespan=None,
	time_interval=None,
	heatmap_year=None,
):
	company = resolve_chart_company(filters)
	empty = filing_queue_chart({})
	if not company:
		return empty
	counts: dict[str, int] = {}
	if frappe.db.exists("DocType", "UAE VAT 201 Filing Log") and frappe.has_permission(
		"UAE VAT 201 Filing Log", "read"
	):
		counts.update(
			count_by_field(
				"UAE VAT 201 Filing Log",
				{
					"company": company,
					"docstatus": ["<", 2],
					"deadline_status": ["in", list(FILING_QUEUE_ORDER)],
				},
				"deadline_status",
			)
		)
	if frappe.db.exists("DocType", "UAE Late Filing Notice") and frappe.has_permission(
		"UAE Late Filing Notice", "read"
	):
		notice_counts = count_by_field(
			"UAE Late Filing Notice",
			{
				"company": company,
				"obligation": ["!=", "VAT 201"],
				"status": ["in", list(FILING_QUEUE_ORDER)],
			},
			"status",
		)
		for status, total in notice_counts.items():
			counts[status] = counts.get(status, 0) + total
	return translate_chart(filing_queue_chart(counts))
