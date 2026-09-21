"""Home KPIs from Desk Number Card specs."""

from __future__ import annotations

import json
from typing import Any

import frappe

from taxmate.api.resource import assert_company_read, require_login
from taxmate.setup.home import NUMBER_CARD_SPECS


def _count(doctype: str, filters: list) -> int:
	from taxmate.api.resource import _permission_aware_count

	return _permission_aware_count(doctype, filters=filters)


@frappe.whitelist()
def get_home(company: str | None = None) -> dict[str, Any]:
	require_login()
	company = company or frappe.defaults.get_user_default("Company")
	assert_company_read(company)
	kpis: list[dict[str, Any]] = []
	for spec in NUMBER_CARD_SPECS:
		doctype = spec["document_type"]
		if not frappe.db.exists("DocType", doctype):
			continue
		if not frappe.has_permission(doctype, "read"):
			continue
		filters = []
		for row in json.loads(spec["filters_json"]):
			if len(row) >= 4:
				filters.append([row[1], row[2], row[3]])
			else:
				filters.append(row)
		if company and frappe.get_meta(doctype).has_field("company"):
			filters.append(["company", "=", company])
		kpis.append(
			{
				"name": spec["name"],
				"label": spec["label"],
				"doctype": doctype,
				"value": _count(doctype, filters),
			}
		)
	return {"company": company, "kpis": kpis}
