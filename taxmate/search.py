"""TaxMate Desk search allowlist (AwesomeBar + Global Search)."""

from __future__ import annotations

import frappe

# Modules in the TaxMate product surface (Ocean sidebar).
ALLOWED_SEARCH_MODULES = frozenset(
	{
		"Accounts",
		"Buying",
		"Selling",
		"Stock",
		"Assets",
		"Regional",
		"UAE VAT",
		"UAE E-Invoicing",
		"UAE Corporate Tax",
		"UAE Compliance",
		"TaxMate",
		"IDP",
		"Contacts",
		"Payments",
		"Email",
		"Automation",
		"Workflow",
	}
)

# Setup / Core doctypes operators still need to find quickly.
ALLOWED_SEARCH_DOCTYPES = frozenset(
	{
		"Company",
		"Address",
		"Contact",
		"Currency",
		"Fiscal Year",
		"Country",
		"Territory",
		"Customer Group",
		"Supplier Group",
		"Item Group",
		"Brand",
		"UOM",
		"Terms and Conditions",
		"Payment Terms Template",
		"Mode of Payment",
		"Sales Taxes and Charges Template",
		"Purchase Taxes and Charges Template",
		"Item Tax Template",
		"Tax Category",
		"Tax Withholding Category",
		"Cost Center",
		"Account",
		"Bank",
		"Bank Account",
		"Payment Gateway Account",
		"File",
		"Print Format",
		"Letter Head",
		"TaxMate Settings",
		"UAE VAT Settings",
		"UAE E-Invoice Settings",
		"UAE E-Invoice Log",
		"UAE CT Settings",
		"UAE CT Filing Log",
		"UAE Related Party",
		"UAE CT Withholding Entry",
		"UAE Shareholder Register",
		"UAE Excise Settings",
		"UAE Excise Filing Log",
		"UAE Capital Goods Record",
		"UAE Capital Goods Adjustment",
		"UAE Bad Debt Relief",
		"UAE Customs Declaration",
		"UAE VAT Group",
		"UAE Establishment",
		"UAE VAT Audit Event",
		"UAE FTA Audit Pack",
		"UAE Late Filing Notice",
		"UAE Compliance Settings",
		"UAE UBO Register",
		"UAE ESR Filing",
		# Email / Automation / Notifications
		"Email Account",
		"Email Domain",
		"Email Template",
		"Email Queue",
		"Email Group",
		"Newsletter",
		"Auto Email Report",
		"Unhandled Email",
		"Notification",
		"Notification Log",
		"Notification Settings",
		"Assignment Rule",
		"Auto Repeat",
		"Reminder",
		"Workflow",
		"Workflow State",
		"Workflow Action",
		"ToDo",
		"Event",
		# Core / Setup operators (User lives in Core, so it is not in the module list)
		"User",
		"Role",
		"Role Profile",
		"Module Profile",
		"User Permission",
		"System Settings",
		"Navbar Settings",
		"Print Settings",
		"Accounts Settings",
		"Buying Settings",
		"Selling Settings",
		"Stock Settings",
		"Global Defaults",
		"Data Import",
		"Data Export",
		"Bulk Update",
		"Deleted Document",
		"Activity Log",
		"Access Log",
		"Error Log",
		"Workspace",
		# Invoice OCR (IDP)
		"IDP Conversation",
		"IDP Message",
		"IDP Settings",
		"IDP Document Log",
		"IDP Batch Job",
		"IDP Extraction Template",
		"IDP Extraction Correction",
		"IDP Prompt Template",
		"IDP Prompt Library",
		"IDP Skill",
		"IDP Tool Configuration",
		"IDP Plugin Configuration",
		"IDP Tool Call Log",
	}
)

# Never surface these even if module mapping is odd.
DENIED_SEARCH_DOCTYPES = frozenset(
	{
		"Employee",
		"Employee Group",
		"Salary Slip",
		"Salary Structure",
		"Payroll Entry",
		"Attendance",
		"Leave Application",
		"BOM",
		"Work Order",
		"Job Card",
		"Production Plan",
		"Lead",
		"Opportunity",
		"Issue",
		"Project",
		"Task",
		"Timesheet",
		"Maintenance Schedule",
		"Maintenance Visit",
		"Warranty Claim",
		"Branch",
		"Designation",
		"Department",
		"User",
		"Role",
		"Has Role",
	}
)

# Document types indexed for "Search for …" global results.
GLOBAL_SEARCH_DOCTYPES = [
	"Customer",
	"Supplier",
	"Item",
	"Item Group",
	"Brand",
	"UOM",
	"Warehouse",
	"Account",
	"Company",
	"Sales Invoice",
	"Sales Order",
	"Quotation",
	"Purchase Order",
	"Purchase Receipt",
	"Purchase Invoice",
	"Delivery Note",
	"Stock Entry",
	"Stock Reconciliation",
	"Material Request",
	"Payment Entry",
	"Journal Entry",
	"Item Price",
	"Asset",
	"UAE E-Invoice Log",
	"UAE CT Filing Log",
]


def is_taxmate_product_site() -> bool:
	apps = set(frappe.get_installed_apps())
	return "taxmate" in apps or bool(frappe.conf.get("taxmate_sidebar_filter"))


def boot_session(bootinfo) -> None:
	"""Attach search allowlist for Desk AwesomeBar filtering."""
	if not is_taxmate_product_site():
		return

	from taxmate.idp.clerk import IDP_ADMIN_SEARCH_DOCTYPES, is_idp_manager

	module_map = {
		row.name: row.module
		for row in frappe.get_all("DocType", filters={"istable": 0}, fields=["name", "module"])
	}
	doctypes = set(ALLOWED_SEARCH_DOCTYPES)
	modules = set(ALLOWED_SEARCH_MODULES)
	denied = set(DENIED_SEARCH_DOCTYPES)
	if not is_idp_manager():
		doctypes -= IDP_ADMIN_SEARCH_DOCTYPES
		modules.discard("IDP")
		denied |= IDP_ADMIN_SEARCH_DOCTYPES
	bootinfo.taxmate_search = {
		"enabled": True,
		"modules": sorted(modules),
		"doctypes": sorted(doctypes),
		"denied_doctypes": sorted(denied),
		"doctype_module": module_map,
	}


def configure_global_search() -> None:
	"""Replace Global Search Settings with TaxMate product doctypes only."""
	if not is_taxmate_product_site():
		return
	if not frappe.db.exists("DocType", "Global Search Settings"):
		return

	settings = frappe.get_single("Global Search Settings")
	settings.allowed_in_global_search = []
	for dt in GLOBAL_SEARCH_DOCTYPES:
		if frappe.db.exists("DocType", dt):
			settings.append("allowed_in_global_search", {"document_type": dt})
	settings.save(ignore_permissions=True)
	frappe.cache.hdel("global_search", "search_priorities")
