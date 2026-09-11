"""VAT 201 Box 14 (net due in AED) by filing period."""

from __future__ import annotations

import frappe
from frappe.utils.dashboard import cache_source

from taxmate.uae_vat.utils.charts import (
	resolve_chart_company,
	select_vat_201_filings,
	translate_chart,
	vat_201_net_due_chart,
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
	empty = vat_201_net_due_chart([])
	if not company or not frappe.db.exists("DocType", "UAE VAT 201 Filing Log"):
		return empty
	if not frappe.has_permission("UAE VAT 201 Filing Log", "read"):
		return empty
	rows = frappe.get_list(
		"UAE VAT 201 Filing Log",
		filters={"company": company, "docstatus": ["<", 2]},
		fields=["period_start", "period_end", "net_vat_due", "docstatus", "modified"],
		order_by="period_end desc",
		limit=500,
	)
	return translate_chart(vat_201_net_due_chart(select_vat_201_filings(rows)))
