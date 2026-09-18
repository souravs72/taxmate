"""Keep Financial Reports visible in TaxMate Desk (Ocean sidebar + workspace).

Ocean hides Frappe's body-sidebar, so report links must live on the Financial
Reports Workspace Sidebar and be nested under that Ocean nav item.
"""

from __future__ import annotations

import frappe

# Core books reports accountants expect on day one.
CORE_REPORT_LINKS: tuple[tuple[str, str], ...] = (
	("Balance Sheet", "Balance Sheet"),
	("Profit and Loss", "Profit and Loss Statement"),
	("Cash Flow", "Cash Flow"),
	("Trial Balance", "Trial Balance"),
	("General Ledger", "General Ledger"),
	("Accounts Receivable", "Accounts Receivable"),
	("Accounts Payable", "Accounts Payable"),
	("Customer Ledger", "Customer Ledger Summary"),
	("Supplier Ledger", "Supplier Ledger Summary"),
	("UAE VAT 201", "UAE VAT 201"),
)

# TaxMate UAE script reports — appended under a UAE Tax section.
TAXMATE_REPORT_LINKS: tuple[tuple[str, str], ...] = (
	("UAE Late Filing Status", "UAE Late Filing Status"),
	("UAE Group VAT Status", "UAE Group VAT Status"),
	("UAE Import VAT Explanation", "UAE Import VAT Explanation"),
	("UAE E-Invoice Status", "UAE E-Invoice Status"),
	("UAE E-Invoice VAT 201 Reconciliation", "UAE E-Invoice VAT 201 Reconciliation"),
	("EmaraTax Export", "EmaraTax Export"),
	("UAE Corporate Tax Worksheet", "UAE Corporate Tax Worksheet"),
	("UAE Compliance Status", "UAE Compliance Status"),
)

SIDEBAR_NAME = "Financial Reports"
WORKSPACE_NAME = "Financial Reports"


def ensure_financial_reports_nav() -> None:
	"""Unhide Financial Reports and ensure Workspace Sidebar has accounting + UAE reports."""
	_ensure_workspace_visible()
	_ensure_desktop_icon_top_level()
	_ensure_workspace_sidebar_reports()
	_ensure_workspace_link_cards()


def _ensure_workspace_visible() -> None:
	if not frappe.db.exists("Workspace", WORKSPACE_NAME):
		return
	frappe.db.set_value(
		"Workspace",
		WORKSPACE_NAME,
		{"is_hidden": 0, "public": 1, "title": "Financial Reports"},
		update_modified=False,
	)


def _ensure_desktop_icon_top_level() -> None:
	"""Financial Reports must not be nested under Accounting (no Accounting workspace in TaxMate)."""
	if not frappe.db.exists("Desktop Icon", SIDEBAR_NAME):
		return
	current_parent = frappe.db.get_value("Desktop Icon", SIDEBAR_NAME, "parent_icon")
	if current_parent:
		frappe.db.set_value(
			"Desktop Icon",
			SIDEBAR_NAME,
			{"parent_icon": "", "hidden": 0},
			update_modified=False,
		)


def _existing_report_targets(sb) -> set[str]:
	return {
		(item.link_to or "").strip()
		for item in (sb.items or [])
		if (item.link_type or "") == "Report" and item.link_to
	}


def _append_section(sb, label: str, icon: str | None = None) -> None:
	row = {
		"type": "Section Break",
		"label": label,
		"link_type": "DocType",
		"child": 0,
		"collapsible": 1,
		"indent": 1,
		"keep_closed": 0,
		"show_arrow": 0,
	}
	if icon:
		row["icon"] = icon
	sb.append("items", row)


def _append_report(sb, label: str, report: str) -> None:
	sb.append(
		"items",
		{
			"type": "Link",
			"label": label,
			"link_type": "Report",
			"link_to": report,
			"child": 1,
			"collapsible": 1,
			"indent": 0,
			"keep_closed": 0,
			"show_arrow": 0,
		},
	)


def _ensure_workspace_sidebar_reports() -> None:
	if not frappe.db.exists("Workspace Sidebar", SIDEBAR_NAME):
		sb = frappe.get_doc(
			{
				"doctype": "Workspace Sidebar",
				"name": SIDEBAR_NAME,
				"title": SIDEBAR_NAME,
				"header_icon": "sheet",
				"app": "erpnext",
				"module": "Accounts",
			}
		)
		_append_section(sb, "Financial Reports", icon="accounting")
		for label, report in CORE_REPORT_LINKS:
			if frappe.db.exists("Report", report) and not frappe.db.get_value("Report", report, "disabled"):
				_append_report(sb, label, report)
		sb.insert(ignore_permissions=True)
		_append_taxmate_reports(sb)
		return

	sb = frappe.get_doc("Workspace Sidebar", SIDEBAR_NAME)
	changed = _append_taxmate_reports(sb, save=False)
	# Ensure at least core reports exist (sidebar may have been emptied).
	have = _existing_report_targets(sb)
	for label, report in CORE_REPORT_LINKS:
		if report in have:
			continue
		if not frappe.db.exists("Report", report) or frappe.db.get_value("Report", report, "disabled"):
			continue
		_append_report(sb, label, report)
		changed = True
	if changed:
		sb.flags.ignore_permissions = True
		sb.save()


def _append_taxmate_reports(sb, save: bool = True) -> bool:
	have = _existing_report_targets(sb)
	to_add = [
		(label, report)
		for label, report in TAXMATE_REPORT_LINKS
		if report not in have
		and frappe.db.exists("Report", report)
		and not frappe.db.get_value("Report", report, "disabled")
	]
	if not to_add:
		return False

	section_exists = any(
		(item.type or "") == "Section Break" and (item.label or "") == "UAE Tax Reports"
		for item in (sb.items or [])
	)
	if not section_exists:
		_append_section(sb, "UAE Tax Reports", icon="organization")
	for label, report in to_add:
		_append_report(sb, label, report)

	if save:
		sb.flags.ignore_permissions = True
		sb.save()
	return True


def _ensure_workspace_link_cards() -> None:
	"""Keep UAE report links on the Financial Reports workspace cards."""
	if not frappe.db.exists("Workspace", WORKSPACE_NAME):
		return

	ws = frappe.get_doc("Workspace", WORKSPACE_NAME)
	existing = {
		(link.link_to or "").strip()
		for link in (ws.links or [])
		if (link.type or "") == "Link" and (link.link_type or "") == "Report" and link.link_to
	}

	wanted = [r for _, r in (*CORE_REPORT_LINKS, *TAXMATE_REPORT_LINKS) if frappe.db.exists("Report", r)]
	missing = [r for r in wanted if r not in existing]
	if not missing:
		return

	has_uae_card = any(
		(link.type or "") == "Card Break" and (link.label or "") == "UAE Tax Reports"
		for link in (ws.links or [])
	)
	changed = False
	if not has_uae_card:
		ws.append("links", {"type": "Card Break", "label": "UAE Tax Reports", "hidden": 0})
		changed = True

	taxmate_targets = {r for _, r in TAXMATE_REPORT_LINKS} | {"UAE VAT 201"}
	for report in missing:
		if report in existing:
			continue
		# Only append TaxMate / VAT reports to the UAE card; core already on cards.
		if report not in taxmate_targets:
			continue
		ws.append(
			"links",
			{
				"type": "Link",
				"label": report,
				"link_type": "Report",
				"link_to": report,
				"hidden": 0,
			},
		)
		existing.add(report)
		changed = True

	if not changed:
		return

	was = frappe.flags.in_patch
	frappe.flags.in_patch = True
	try:
		ws.flags.ignore_permissions = True
		ws.flags.ignore_mandatory = True
		ws.flags.ignore_links = True
		ws.save()
	finally:
		frappe.flags.in_patch = was
