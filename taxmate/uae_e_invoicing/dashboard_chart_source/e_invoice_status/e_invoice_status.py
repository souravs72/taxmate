"""Live e-invoice pipeline (FTA buckets, not raw ASP statuses)."""

from __future__ import annotations

import frappe
from frappe.utils.dashboard import cache_source

from taxmate.uae_vat.utils.charts import (
	count_by_field,
	e_invoice_status_chart,
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
	empty = e_invoice_status_chart({})
	if not company or not frappe.db.exists("DocType", "UAE E-Invoice Log"):
		return empty
	if not frappe.has_permission("UAE E-Invoice Log", "read"):
		return empty
	counts = count_by_field(
		"UAE E-Invoice Log",
		{"company": company, "status": ["!=", "Cancelled"]},
		"status",
	)
	return translate_chart(e_invoice_status_chart(counts))
