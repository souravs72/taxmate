"""Header company switcher and Company Settings helpers.

Importers/callers: SPA CompanySettings + CompanySwitcher via get_catalog().
Affected API: list_my_companies, switch_company, list_company_addresses, upload_company_logo.
Data schemas: Company, Address (Dynamic Link), File.
User instruction: implement Company Settings completeness plan (tabs, roles, UAE fields).
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe.utils.file_manager import save_file

from taxmate.api.resource import assert_company_read, require_login
from taxmate.setup.spa_roles import require_spa_role
from taxmate.utils.company import get_default_company, set_active_company, user_companies


@frappe.whitelist(methods=["GET"])
def list_my_companies() -> dict[str, Any]:
	"""Companies the signed-in user may switch to, and which one is active."""
	require_login()
	names = user_companies()
	rows = []
	if names:
		rows = frappe.get_list(
			"Company",
			filters={"name": ["in", names]},
			fields=["name", "company_name", "abbr", "default_currency", "country"],
			order_by="company_name asc",
			limit=len(names),
		)
	return {"active": get_default_company(), "companies": rows}


@frappe.whitelist(methods=["POST"])
def switch_company(company: str) -> dict[str, Any]:
	"""Make ``company`` the user's active company. Persists across logout."""
	require_login()
	company = (company or "").strip()
	set_active_company(company)
	return {"active": company}


@frappe.whitelist(methods=["GET"])
def list_company_addresses(company: str | None = None) -> list[dict[str, Any]]:
	"""Addresses linked to the company via Dynamic Link (Company has no address child table)."""
	require_login()
	company = (company or "").strip() or get_default_company()
	if not company:
		frappe.throw(frappe._("Company is required"))
	assert_company_read(company)
	return frappe.get_all(
		"Address",
		filters=[
			["Dynamic Link", "link_doctype", "=", "Company"],
			["Dynamic Link", "link_name", "=", company],
		],
		fields=["name", "address_title", "address_type", "address_line1", "city", "country"],
		order_by="is_primary_address desc, modified desc",
		limit=20,
	)


@frappe.whitelist(methods=["POST"])
def upload_company_logo(company: str | None = None) -> dict[str, Any]:
	"""Upload a public image and set Company.company_logo. Owner / Administrator only."""
	require_login()
	require_spa_role("owner")
	company = (company or "").strip() or get_default_company()
	if not company:
		frappe.throw(frappe._("Company is required"))
	assert_company_read(company)
	if not frappe.has_permission("Company", "write", doc=company):
		frappe.throw(frappe._("Not permitted"), frappe.PermissionError)

	files = frappe.request.files
	upload = files.get("file") if files else None
	if not upload:
		frappe.throw(frappe._("No file uploaded"))

	content = upload.stream.read()
	filename = frappe.utils.cstr(upload.filename or "logo.png")
	saved = save_file(filename, content, "Company", company, is_private=0)
	file_url = saved.file_url
	frappe.db.set_value("Company", company, "company_logo", file_url)
	frappe.clear_document_cache("Company", company)
	return {"file_url": file_url, "company": company}
