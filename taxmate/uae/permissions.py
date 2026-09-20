"""Company tenancy for TaxMate documents.

Frappe v16 calls ``permission_query_conditions`` as
``method(user, doctype=doctype)`` (frappe/model/db_query.py). ``has_permission``
hooks receive ``doc``, ``ptype``, and ``user``.
"""

from __future__ import annotations

import frappe
from frappe.utils import cstr


def get_permission_query_conditions(user=None, doctype=None):
	user = user or frappe.session.user
	if not user or user == "Administrator":
		return ""
	if "System Manager" in frappe.get_roles(user):
		return ""
	if not doctype or not frappe.db.exists("DocType", doctype):
		return ""
	if not frappe.get_meta(doctype).has_field("company"):
		return ""
	companies = _user_companies(user)
	if companies is None:
		return ""
	if not companies:
		return "1=0"
	quoted = ", ".join(frappe.db.escape(name) for name in companies)
	return f"`tab{doctype}`.company in ({quoted})"


def has_permission(doc=None, ptype=None, user=None, debug=False):
	if not doc:
		return True
	company = doc.get("company") if hasattr(doc, "get") else getattr(doc, "company", None)
	if not company:
		return True
	user = user or frappe.session.user
	if not user or user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	companies = _user_companies(user)
	if companies is None:
		return True
	return cstr(company) in companies


def _user_companies(user: str) -> list[str] | None:
	"""Companies from User Permission. ``None`` means no extra restriction."""
	if not frappe.db.exists("DocType", "User Permission"):
		return None
	values = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Company"},
		pluck="for_value",
	)
	if not values:
		return None
	return [cstr(v) for v in values if v]
