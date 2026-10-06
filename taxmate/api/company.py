"""Header company switcher."""

from __future__ import annotations

from typing import Any

import frappe

from taxmate.api.resource import require_login
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
