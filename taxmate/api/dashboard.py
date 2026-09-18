"""Home KPIs a custom frontend can render without Desk Number Cards."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import assert_company_read
from taxmate.setup.home import NUMBER_CARD_SPECS


def _count(doctype: str, filters: list) -> int:
	return len(frappe.get_list(doctype, filters=filters, pluck="name", limit=9999) or [])


@frappe.whitelist()
def get_home(company: str | None = None) -> dict[str, Any]:
	if frappe.session.user == "Guest":
		frappe.throw(_("Login required"), frappe.AuthenticationError)

	company = company or frappe.defaults.get_user_default("Company")
	assert_company_read(company)
	kpis: list[dict[str, Any]] = []
	for spec in NUMBER_CARD_SPECS:
		doctype = spec["document_type"]
		if not frappe.db.exists("DocType", doctype):
			continue
		if not frappe.has_permission(doctype, "read"):
			continue
		filters = json.loads(spec["filters_json"])
		if company and frappe.get_meta(doctype).has_field("company"):
			filters.append([doctype, "company", "=", company])
		kpis.append(
			{
				"name": spec["name"],
				"label": spec["label"],
				"doctype": doctype,
				"value": _count(doctype, filters),
			}
		)
	return {"company": company, "kpis": kpis}
