"""Make Desk Home the UAE accounting landing page for TaxMate.

ERPNext ships a generic Home (Item / Customer / Stock / CRM). TaxMate
reuses that Workspace — it is the `/app/home` route — and fills it with
daily books work, UAE tax queues, and KPI number cards.

Full compliance catalogues stay on the UAE Compliance workspace. Home shows
KPI cards plus UAE tax charts (VAT 201 Box 14, e-invoice pipeline, filing
queue) and a shortcut to the UAE Tax dashboard.
"""

from __future__ import annotations

import json
from typing import Any

import frappe

CONTENT_MARKER = "tm_home"

NUMBER_CARD_SPECS: tuple[dict[str, Any], ...] = (
	{
		"name": "Draft Sales Invoices",
		"label": "Draft Sales Invoices",
		"module": "Accounts",
		"document_type": "Sales Invoice",
		"function": "Count",
		"filters_json": json.dumps([["Sales Invoice", "docstatus", "=", 0]]),
		"dynamic_filters_json": json.dumps(
			[
				[
					"Sales Invoice",
					"company",
					"=",
					'frappe.defaults.get_user_default("Company")',
				]
			]
		),
		"color": "#f39c12",
	},
	{
		"name": "Failed E-Invoices",
		"label": "Failed E-Invoices",
		"module": "UAE E-Invoicing",
		"document_type": "UAE E-Invoice Log",
		"function": "Count",
		"filters_json": json.dumps(
			[["UAE E-Invoice Log", "status", "in", ["Failed", "Rejected"]]]
		),
		"dynamic_filters_json": json.dumps(
			[
				[
					"UAE E-Invoice Log",
					"company",
					"=",
					'frappe.defaults.get_user_default("Company")',
				]
			]
		),
		"color": "#e74c3c",
	},
	{
		"name": "Overdue VAT 201",
		"label": "Overdue VAT 201",
		"module": "UAE VAT",
		"document_type": "UAE VAT 201 Filing Log",
		"function": "Count",
		"filters_json": json.dumps(
			[
				["UAE VAT 201 Filing Log", "deadline_status", "=", "Overdue"],
				["UAE VAT 201 Filing Log", "docstatus", "<", 2],
			]
		),
		"dynamic_filters_json": json.dumps(
			[
				[
					"UAE VAT 201 Filing Log",
					"company",
					"=",
					'frappe.defaults.get_user_default("Company")',
				]
			]
		),
		"color": "#e74c3c",
	},
	{
		"name": "Draft VAT 201",
		"label": "Draft VAT 201",
		"module": "UAE VAT",
		"document_type": "UAE VAT 201 Filing Log",
		"function": "Count",
		"filters_json": json.dumps(
			[
				["UAE VAT 201 Filing Log", "status", "=", "Draft"],
				["UAE VAT 201 Filing Log", "docstatus", "=", 0],
			]
		),
		"dynamic_filters_json": json.dumps(
			[
				[
					"UAE VAT 201 Filing Log",
					"company",
					"=",
					'frappe.defaults.get_user_default("Company")',
				]
			]
		),
		"color": "#f39c12",
	},
)

DAILY_SHORTCUTS: tuple[dict[str, Any], ...] = (
	{
		"label": "Sales Invoice",
		"type": "DocType",
		"link_to": "Sales Invoice",
		"stats_filter": json.dumps([["Sales Invoice", "docstatus", "=", 0]]),
		"format": "{} Draft",
		"color": "#f39c12",
	},
	{
		"label": "Purchase Invoice",
		"type": "DocType",
		"link_to": "Purchase Invoice",
		"stats_filter": json.dumps([["Purchase Invoice", "docstatus", "=", 0]]),
		"format": "{} Draft",
		"color": "#f39c12",
	},
	{
		"label": "Invoice OCR",
		"type": "URL",
		"url": "/idp/chat",
		"color": "#12715B",
	},
	{"label": "Payment Entry", "type": "DocType", "link_to": "Payment Entry"},
	{"label": "Journal Entry", "type": "DocType", "link_to": "Journal Entry"},
	{"label": "Customer", "type": "DocType", "link_to": "Customer"},
	{"label": "Supplier", "type": "DocType", "link_to": "Supplier"},
	{"label": "Item", "type": "DocType", "link_to": "Item"},
	{
		"label": "Chart of Accounts",
		"type": "DocType",
		"link_to": "Account",
		"doc_view": "Tree",
	},
)

UAE_SHORTCUTS: tuple[dict[str, Any], ...] = (
	{
		"label": "VAT 201",
		"type": "DocType",
		"link_to": "UAE VAT 201 Filing Log",
		"stats_filter": json.dumps(
			[
				["UAE VAT 201 Filing Log", "deadline_status", "=", "Overdue"],
				["UAE VAT 201 Filing Log", "docstatus", "<", 2],
			]
		),
		"format": "{} Overdue",
		"color": "#e74c3c",
	},
	{
		"label": "E-Invoices",
		"type": "DocType",
		"link_to": "UAE E-Invoice Log",
		"stats_filter": json.dumps(
			[["UAE E-Invoice Log", "status", "in", ["Failed", "Rejected"]]]
		),
		"format": "{} Failed",
		"color": "#e74c3c",
	},
	{"label": "Incoming e-Invoices", "type": "DocType", "link_to": "UAE Incoming Invoice"},
	{"label": "Corporate Tax", "type": "DocType", "link_to": "UAE CT Filing Log"},
	{"label": "UAE Tax Dashboard", "type": "Dashboard", "link_to": "UAE Tax"},
)

# Card Break followed by its links. Order is the Home layout.
HOME_LINKS: tuple[dict[str, Any], ...] = (
	{"type": "Card Break", "label": "UAE VAT"},
	{"type": "Link", "label": "VAT 201 Filing Log", "link_type": "DocType", "link_to": "UAE VAT 201 Filing Log", "onboard": 1},
	{"type": "Link", "label": "UAE VAT 201", "link_type": "Report", "link_to": "UAE VAT 201", "is_query_report": 1},
	{"type": "Link", "label": "Late Filing Notice", "link_type": "DocType", "link_to": "UAE Late Filing Notice"},
	{"type": "Link", "label": "Late Filing Status", "link_type": "Report", "link_to": "UAE Late Filing Status", "is_query_report": 1},
	{"type": "Link", "label": "Customs Declaration", "link_type": "DocType", "link_to": "UAE Customs Declaration"},
	{"type": "Link", "label": "Import VAT Explanation", "link_type": "Report", "link_to": "UAE Import VAT Explanation", "is_query_report": 1},
	{"type": "Link", "label": "VAT Group", "link_type": "DocType", "link_to": "UAE VAT Group"},
	{"type": "Link", "label": "Bad Debt Relief", "link_type": "DocType", "link_to": "UAE Bad Debt Relief"},
	{"type": "Card Break", "label": "E-Invoicing"},
	{"type": "Link", "label": "E-Invoice Log", "link_type": "DocType", "link_to": "UAE E-Invoice Log", "onboard": 1},
	{"type": "Link", "label": "Incoming Invoice", "link_type": "DocType", "link_to": "UAE Incoming Invoice", "onboard": 1},
	{"type": "Link", "label": "E-Invoice Contingency", "link_type": "DocType", "link_to": "UAE E-Invoice Contingency"},
	{"type": "Link", "label": "E-Invoice Status", "link_type": "Report", "link_to": "UAE E-Invoice Status", "is_query_report": 1},
	{"type": "Link", "label": "VAT 201 Reconciliation", "link_type": "Report", "link_to": "UAE E-Invoice VAT 201 Reconciliation", "is_query_report": 1},
	{"type": "Link", "label": "EmaraTax Export", "link_type": "Report", "link_to": "EmaraTax Export", "is_query_report": 1},
	{"type": "Card Break", "label": "Corporate Tax"},
	{"type": "Link", "label": "CT Settings", "link_type": "DocType", "link_to": "UAE CT Settings", "onboard": 1},
	{"type": "Link", "label": "CT Filing Log", "link_type": "DocType", "link_to": "UAE CT Filing Log", "onboard": 1},
	{"type": "Link", "label": "Corporate Tax Worksheet", "link_type": "Report", "link_to": "UAE Corporate Tax Worksheet", "is_query_report": 1},
	{"type": "Link", "label": "Related Party", "link_type": "DocType", "link_to": "UAE Related Party"},
	{"type": "Link", "label": "UBO Register", "link_type": "DocType", "link_to": "UAE UBO Register"},
	{"type": "Link", "label": "ESR Filing", "link_type": "DocType", "link_to": "UAE ESR Filing"},
	{"type": "Link", "label": "Compliance Status", "link_type": "Report", "link_to": "UAE Compliance Status", "is_query_report": 1},
	{"type": "Link", "label": "FTA Audit Pack", "link_type": "DocType", "link_to": "UAE FTA Audit Pack"},
	{"type": "Card Break", "label": "Accounting"},
	{"type": "Link", "label": "Chart of Accounts", "link_type": "DocType", "link_to": "Account", "onboard": 1},
	{"type": "Link", "label": "Company", "link_type": "DocType", "link_to": "Company", "onboard": 1},
	{"type": "Link", "label": "Customer", "link_type": "DocType", "link_to": "Customer", "onboard": 1},
	{"type": "Link", "label": "Supplier", "link_type": "DocType", "link_to": "Supplier", "onboard": 1},
	{"type": "Link", "label": "Payment Entry", "link_type": "DocType", "link_to": "Payment Entry"},
	{"type": "Link", "label": "Journal Entry", "link_type": "DocType", "link_to": "Journal Entry"},
	{"type": "Card Break", "label": "Stock"},
	{"type": "Link", "label": "Item", "link_type": "DocType", "link_to": "Item", "onboard": 1},
	{"type": "Link", "label": "Warehouse", "link_type": "DocType", "link_to": "Warehouse", "onboard": 1},
	{"type": "Link", "label": "Brand", "link_type": "DocType", "link_to": "Brand"},
	{"type": "Link", "label": "Unit of Measure (UOM)", "link_type": "DocType", "link_to": "UOM"},
	{"type": "Link", "label": "Stock Reconciliation", "link_type": "DocType", "link_to": "Stock Reconciliation"},
	{"type": "Card Break", "label": "CRM"},
	{"type": "Link", "label": "Lead", "link_type": "DocType", "link_to": "Lead", "onboard": 1},
	{"type": "Link", "label": "Customer Group", "link_type": "DocType", "link_to": "Customer Group"},
	{"type": "Link", "label": "Territory", "link_type": "DocType", "link_to": "Territory"},
	{"type": "Card Break", "label": "Data Import and Settings"},
	{"type": "Link", "label": "Import Data", "link_type": "DocType", "link_to": "Data Import", "onboard": 1},
	{"type": "Link", "label": "Opening Invoice Creation Tool", "link_type": "DocType", "link_to": "Opening Invoice Creation Tool"},
	{"type": "Link", "label": "Chart of Accounts Importer", "link_type": "DocType", "link_to": "Chart of Accounts Importer"},
	{"type": "Link", "label": "Letter Head", "link_type": "DocType", "link_to": "Letter Head"},
	{"type": "Link", "label": "Email Account", "link_type": "DocType", "link_to": "Email Account"},
	{"type": "Link", "label": "TaxMate Settings", "link_type": "DocType", "link_to": "TaxMate Settings"},
)

_SHORTCUT_FIELDS = (
	"type",
	"link_to",
	"url",
	"doc_view",
	"label",
	"icon",
	"color",
	"stats_filter",
	"format",
	"kanban_board",
)
_LINK_FIELDS = (
	"type",
	"label",
	"link_type",
	"link_to",
	"onboard",
	"is_query_report",
	"hidden",
	"link_count",
	"dependencies",
)


def build_home_content(
	*,
	number_card_labels: list[str],
	daily_shortcut_labels: list[str],
	uae_shortcut_labels: list[str],
	card_names: list[str],
	extra_shortcut_labels: list[str] | None = None,
	chart_layout: list[tuple[str, int]] | None = None,
) -> str:
	"""Workspace.content JSON: KPIs, charts, daily work, UAE tax, extras, then cards."""
	blocks: list[dict[str, Any]] = [
		{
			"id": CONTENT_MARKER,
			"type": "header",
			"data": {"text": '<span class="h4"><b>At a glance</b></span>', "col": 12},
		}
	]
	for i, label in enumerate(number_card_labels):
		blocks.append(
			{
				"id": f"tm_home_kpi_{i}",
				"type": "number_card",
				"data": {"number_card_name": label, "col": 3},
			}
		)
	if chart_layout:
		blocks.append(
			{
				"id": "tm_home_chart_hdr",
				"type": "header",
				"data": {"text": '<span class="h4"><b>UAE tax trends</b></span>', "col": 12},
			}
		)
		for i, (name, col) in enumerate(chart_layout):
			blocks.append(
				{
					"id": f"tm_home_chart_{i}",
					"type": "chart",
					"data": {"chart_name": name, "col": col},
				}
			)
	blocks.append(
		{
			"id": "tm_home_daily_hdr",
			"type": "header",
			"data": {"text": '<span class="h4"><b>Daily work</b></span>', "col": 12},
		}
	)
	for i, label in enumerate(daily_shortcut_labels):
		blocks.append(
			{
				"id": f"tm_home_daily_{i}",
				"type": "shortcut",
				"data": {"shortcut_name": label, "col": 3},
			}
		)
	blocks.append(
		{
			"id": "tm_home_uae_hdr",
			"type": "header",
			"data": {"text": '<span class="h4"><b>UAE tax</b></span>', "col": 12},
		}
	)
	for i, label in enumerate(uae_shortcut_labels):
		blocks.append(
			{
				"id": f"tm_home_uae_{i}",
				"type": "shortcut",
				"data": {"shortcut_name": label, "col": 3},
			}
		)
	for i, label in enumerate(extra_shortcut_labels or []):
		if i == 0:
			blocks.append(
				{
					"id": "tm_home_more_hdr",
					"type": "header",
					"data": {"text": '<span class="h4"><b>More</b></span>', "col": 12},
				}
			)
		blocks.append(
			{
				"id": f"tm_home_more_{i}",
				"type": "shortcut",
				"data": {"shortcut_name": label, "col": 3},
			}
		)
	blocks.append(
		{
			"id": "tm_home_cards_hdr",
			"type": "header",
			"data": {"text": '<span class="h4"><b>Reports &amp; Masters</b></span>', "col": 12},
		}
	)
	for i, name in enumerate(card_names):
		blocks.append(
			{
				"id": f"tm_home_card_{i}",
				"type": "card",
				"data": {"card_name": name, "col": 4},
			}
		)
	return json.dumps(blocks)


def merge_child_rows(
	existing: list[dict[str, Any]],
	wanted: list[dict[str, Any]],
	key: str = "label",
) -> list[dict[str, Any]]:
	"""Wanted rows first (updated in place); keep extras the site already had."""
	wanted_keys = {row[key] for row in wanted if row.get(key)}
	extras = [row for row in existing if row.get(key) and row[key] not in wanted_keys]
	return list(wanted) + extras


def split_shortcut_labels(
	merged: list[dict[str, Any]],
	daily: list[dict[str, Any]],
	uae: list[dict[str, Any]],
) -> tuple[list[str], list[str], list[str]]:
	"""Keep extras out of the UAE tax block."""
	daily_set = {row["label"] for row in daily}
	uae_set = {row["label"] for row in uae}
	daily_labels = [row["label"] for row in merged if row.get("label") in daily_set]
	uae_labels = [row["label"] for row in merged if row.get("label") in uae_set]
	extra_labels = [
		row["label"]
		for row in merged
		if row.get("label") and row["label"] not in daily_set | uae_set
	]
	return daily_labels, uae_labels, extra_labels


def ensure_uae_home_workspace() -> None:
	"""Idempotent: KPI cards, charts, and UAE Home layout."""
	ensure_number_cards()
	from taxmate.setup.charts import HOME_CHART_LAYOUT, ensure_uae_charts

	ensure_uae_charts()
	if not frappe.db.exists("Workspace", "Home"):
		return

	home = frappe.get_doc("Workspace", "Home")
	existing_shortcuts = _child_dicts(home.shortcuts, _SHORTCUT_FIELDS)

	daily = [row for row in DAILY_SHORTCUTS if _shortcut_target_exists(row)]
	uae = [row for row in UAE_SHORTCUTS if _shortcut_target_exists(row)]
	# TaxMate owns Home cards; do not append leftover links onto the last card.
	links = _with_link_counts([row for row in HOME_LINKS if _link_target_exists(row)])
	cards = [
		{"number_card_name": spec["name"], "label": spec["label"]}
		for spec in NUMBER_CARD_SPECS
		if frappe.db.exists("Number Card", spec["name"])
	]

	merged_shortcuts = merge_child_rows(existing_shortcuts, daily + uae)
	daily_labels, uae_labels, extra_labels = split_shortcut_labels(merged_shortcuts, daily, uae)
	card_names = _card_break_labels(links)

	home.shortcuts = []
	for row in merged_shortcuts:
		home.append("shortcuts", row)
	home.links = []
	for row in links:
		home.append("links", row)
	home.number_cards = []
	for row in cards:
		home.append("number_cards", row)
	chart_layout = [
		(name, col)
		for name, col in HOME_CHART_LAYOUT
		if frappe.db.exists("Dashboard Chart", name)
	]
	home.charts = []
	for name, _col in chart_layout:
		home.append("charts", {"chart_name": name, "label": name})

	home.content = build_home_content(
		number_card_labels=[row["label"] for row in cards],
		daily_shortcut_labels=daily_labels,
		uae_shortcut_labels=uae_labels,
		extra_shortcut_labels=extra_labels,
		card_names=card_names,
		chart_layout=chart_layout,
	)
	_save_workspace(home)


def ensure_number_cards() -> None:
	for spec in NUMBER_CARD_SPECS:
		if not frappe.db.exists("DocType", spec["document_type"]):
			continue
		values = {
			"label": spec["label"],
			"type": "Document Type",
			"document_type": spec["document_type"],
			"function": spec["function"],
			"filters_json": spec["filters_json"],
			"dynamic_filters_json": spec.get("dynamic_filters_json") or "[]",
			"color": spec.get("color"),
			"is_public": 1,
			"is_standard": 0,
			"show_percentage_stats": 0,
			"stats_time_interval": "Daily",
		}
		module = spec.get("module")
		if module and frappe.db.exists("Module Def", module):
			values["module"] = module
		if frappe.db.exists("Number Card", spec["name"]):
			doc = frappe.get_doc("Number Card", spec["name"])
			doc.update(values)
			_save_setup_doc(doc)
			continue
		# Do not pass name into get_doc — Frappe then treats the row as loaded
		# and save() raises DoesNotExistError before insert.
		doc = frappe.get_doc({"doctype": "Number Card", **values})
		_save_setup_doc(doc)
		if doc.name != spec["name"]:
			frappe.rename_doc("Number Card", doc.name, spec["name"], force=True)


def _save_setup_doc(doc) -> None:
	"""Insert or save without exporting fixtures when developer_mode is on."""
	doc.flags.ignore_permissions = True
	was = frappe.flags.in_patch
	frappe.flags.in_patch = True
	try:
		if doc.is_new() or not doc.name or not frappe.db.exists(doc.doctype, doc.name):
			doc.insert()
		else:
			doc.save()
	finally:
		frappe.flags.in_patch = was


def _save_workspace(doc) -> None:
	"""Avoid exporting ERPNext's Home.json when developer_mode is on."""
	was = frappe.flags.in_patch
	frappe.flags.in_patch = True
	try:
		doc.flags.ignore_permissions = True
		doc.save()
	finally:
		frappe.flags.in_patch = was
	frappe.clear_cache()


def _shortcut_target_exists(row: dict[str, Any]) -> bool:
	if (row.get("type") or "") == "URL":
		url = (row.get("url") or row.get("link_to") or "").strip()
		if not url:
			return False
		if url.startswith("/idp"):
			return bool(frappe.db.exists("DocType", "IDP Conversation"))
		return True
	return _target_exists(row.get("type") or "DocType", row.get("link_to"))


def _link_target_exists(row: dict[str, Any]) -> bool:
	if row.get("type") == "Card Break":
		return True
	return _target_exists(row.get("link_type") or "DocType", row.get("link_to"))


def _target_exists(link_type: str, link_to: str | None) -> bool:
	if not link_to:
		return False
	doctype = {
		"DocType": "DocType",
		"Report": "Report",
		"Page": "Page",
		"Dashboard": "Dashboard",
	}.get(link_type)
	if not doctype:
		return True
	return bool(frappe.db.exists(doctype, link_to))


def _with_link_counts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
	out: list[dict[str, Any]] = []
	i = 0
	while i < len(rows):
		row = dict(rows[i])
		if row.get("type") == "Card Break":
			count = 0
			j = i + 1
			while j < len(rows) and rows[j].get("type") != "Card Break":
				if rows[j].get("type") == "Link":
					count += 1
				j += 1
			row["link_count"] = count
		out.append(row)
		i += 1
	return out


def _card_break_labels(rows: list[dict[str, Any]]) -> list[str]:
	return [row["label"] for row in rows if row.get("type") == "Card Break" and row.get("label")]


def _child_dicts(rows, fields: tuple[str, ...]) -> list[dict[str, Any]]:
	out: list[dict[str, Any]] = []
	for row in rows or []:
		if hasattr(row, "as_dict"):
			raw = row.as_dict()
		else:
			raw = dict(row)
		out.append({key: raw[key] for key in fields if raw.get(key) not in (None, "")})
	return out
