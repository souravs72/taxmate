"""Install UAE Tax dashboard charts (VAT 201, e-invoice pipeline, filing queue)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import frappe
from frappe.modules.import_file import import_file_by_path

HOME_CHART_LAYOUT: tuple[tuple[str, int], ...] = (
	("VAT 201 Net Due", 12),
	("E-Invoice Status", 6),
	("Filing Queue", 6),
)

# Dashboard Chart Source JSON fixtures. Import — do not insert via Python:
# Dashboard Chart Source.on_update throws outside developer_mode when a request exists.
CHART_SOURCE_FILES: tuple[tuple[str, ...], ...] = (
	("uae_vat", "dashboard_chart_source", "vat_201_net_due", "vat_201_net_due.json"),
	("uae_e_invoicing", "dashboard_chart_source", "e_invoice_status", "e_invoice_status.json"),
	("uae_vat", "dashboard_chart_source", "filing_queue", "filing_queue.json"),
)

CHART_SPECS: tuple[dict[str, Any], ...] = (
	{
		"name": "VAT 201 Net Due",
		"source": "VAT 201 Net Due",
		"module": "UAE VAT",
		"type": "Bar",
		"color": "#0f6b4c",
		"show_values_over_chart": 1,
		"currency": "AED",
		"custom_options": {
			"fieldtype": "Currency",
			"options": "AED",
			"colors": ["#0f6b4c"],
			"axisOptions": {"shortenYAxisNumbers": 1},
			"barOptions": {"spaceRatio": 0.45},
			"height": 280,
		},
	},
	{
		"name": "E-Invoice Status",
		"source": "E-Invoice Status",
		"module": "UAE E-Invoicing",
		"type": "Donut",
		"color": "#2490ef",
		"show_values_over_chart": 1,
		"custom_options": {
			"colors": ["#6b7280", "#2490ef", "#16a34a", "#dc2626"],
			"maxSlices": 4,
			"truncateLegends": 1,
			"height": 280,
		},
	},
	{
		"name": "Filing Queue",
		"source": "Filing Queue",
		"module": "UAE VAT",
		"type": "Bar",
		"color": "#2490ef",
		"show_values_over_chart": 1,
		"custom_options": {
			"colors": ["#2490ef"],
			"axisOptions": {"shortenYAxisNumbers": 1},
			"barOptions": {"spaceRatio": 0.45},
			"height": 280,
		},
	},
)

CHART_ROLES = (
	"Accounts User",
	"Accounts Manager",
	"UAE Tax Manager",
	"System Manager",
)

_COMPANY_DYNAMIC = json.dumps({"company": 'frappe.defaults.get_user_default("Company")'})


def ensure_uae_charts() -> None:
	_import_chart_sources()
	for spec in CHART_SPECS:
		if frappe.db.exists("Dashboard Chart Source", spec["source"]):
			_upsert_chart(spec)
	_upsert_dashboard()


def _import_chart_sources() -> None:
	app_path = Path(frappe.get_app_path("taxmate"))
	for spec, parts in zip(CHART_SPECS, CHART_SOURCE_FILES, strict=True):
		if frappe.db.exists("Dashboard Chart Source", spec["source"]):
			continue
		path = app_path.joinpath(*parts)
		if path.exists():
			import_file_by_path(str(path), ignore_version=True)


def _upsert_chart(spec: dict[str, Any]) -> None:
	values = {
		"chart_name": spec["name"],
		"chart_type": "Custom",
		"source": spec["source"],
		"type": spec["type"],
		"is_public": 1,
		"is_standard": 0,
		"timeseries": 0,
		"filters_json": "{}",
		"dynamic_filters_json": _COMPANY_DYNAMIC,
		"custom_options": json.dumps(spec["custom_options"]),
		"color": spec.get("color"),
		"show_values_over_chart": spec.get("show_values_over_chart") or 0,
		"use_report_chart": 0,
	}
	if spec.get("currency") and frappe.db.exists("Currency", spec["currency"]):
		values["currency"] = spec["currency"]
	if spec.get("module") and frappe.db.exists("Module Def", spec["module"]):
		values["module"] = spec["module"]
	if frappe.db.exists("Dashboard Chart", spec["name"]):
		doc = frappe.get_doc("Dashboard Chart", spec["name"])
		doc.update(values)
	else:
		doc = frappe.get_doc({"doctype": "Dashboard Chart", **values})
	doc.roles = []
	for role in CHART_ROLES:
		if frappe.db.exists("Role", role):
			doc.append("roles", {"role": role})
	_save_doc(doc)


def _upsert_dashboard() -> None:
	charts = [
		{"chart": name, "width": "Full" if col == 12 else "Half"}
		for name, col in HOME_CHART_LAYOUT
		if frappe.db.exists("Dashboard Chart", name)
	]
	if not charts:
		return
	cards = [
		{"card": name}
		for name in (
			"Draft Sales Invoices",
			"Failed E-Invoices",
			"Overdue VAT 201",
			"Draft VAT 201",
		)
		if frappe.db.exists("Number Card", name)
	]
	values = {
		"dashboard_name": "UAE Tax",
		"is_standard": 0,
		"is_default": 0,
	}
	if frappe.db.exists("Module Def", "UAE VAT"):
		values["module"] = "UAE VAT"
	if frappe.db.exists("Dashboard", "UAE Tax"):
		doc = frappe.get_doc("Dashboard", "UAE Tax")
		doc.update(values)
		doc.charts = []
		doc.cards = []
	else:
		doc = frappe.get_doc({"doctype": "Dashboard", **values})
	for row in charts:
		doc.append("charts", row)
	for row in cards:
		doc.append("cards", row)
	_save_doc(doc)


def _save_doc(doc) -> None:
	doc.flags.ignore_permissions = True
	was = frappe.flags.in_patch
	frappe.flags.in_patch = True
	try:
		if doc.is_new():
			doc.insert()
		else:
			doc.save()
	finally:
		frappe.flags.in_patch = was
