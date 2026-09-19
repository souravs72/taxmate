"""Sales Order KPIs for the TaxMate SPA list screen."""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils import cint, flt, getdate, today

from taxmate.api.resource import assert_company_read, require_login

# Open = promised and not fully billed (excludes Draft / Completed / Cancelled / Closed).
_OPEN_STATUSES = (
	"To Deliver and Bill",
	"To Bill",
	"To Deliver",
	"To Pay",
	"On Hold",
)


@frappe.whitelist()
def fulfilment_summary(company: str | None = None) -> dict[str, Any]:
	"""Committed / delivered / billed value plus open and overdue counts.

	Used by the Sales Order list tiles and fulfilment bars. Permission-checked
	via ``has_permission``; guests are rejected.
	"""
	require_login()
	if not frappe.has_permission("Sales Order", "read"):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	company = company or frappe.defaults.get_user_default("Company")
	assert_company_read(company)

	filters: dict[str, Any] = {"docstatus": ["<", 2]}
	if company:
		filters["company"] = company

	rows = frappe.get_all(
		"Sales Order",
		filters=filters,
		fields=[
			"name",
			"status",
			"docstatus",
			"grand_total",
			"per_delivered",
			"per_billed",
			"delivery_date",
			"transaction_date",
		],
		limit_page_length=0,
	)

	committed = 0.0
	delivered_value = 0.0
	billed_value = 0.0
	open_count = 0
	overdue_count = 0
	today_date = getdate(today())

	for row in rows:
		if row.docstatus == 0 or row.status in ("Draft", "Cancelled"):
			continue

		total = flt(row.grand_total)
		per_d = flt(row.per_delivered)
		per_b = flt(row.per_billed)
		delivered = total * per_d / 100.0
		billed = total * per_b / 100.0

		committed += total
		delivered_value += delivered
		billed_value += billed

		if row.status in _OPEN_STATUSES:
			open_count += 1
			if row.delivery_date and getdate(row.delivery_date) < today_date and per_d < 100:
				overdue_count += 1

	return {
		"company": company,
		"committed": committed,
		"delivered_value": delivered_value,
		"billed_value": billed_value,
		"unbilled_delivered": max(delivered_value - billed_value, 0.0),
		"open_count": cint(open_count),
		"overdue_count": cint(overdue_count),
	}
