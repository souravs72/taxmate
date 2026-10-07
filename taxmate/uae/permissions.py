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
	from taxmate.utils.company import owning_company_field

	field = owning_company_field(doctype)
	if not field:
		return ""
	fieldname, required = field
	companies = _user_companies(user)
	if companies is None:
		return ""
	if not companies:
		return "1=0"
	quoted = ", ".join(frappe.db.escape(name) for name in _companies_for_query(user, companies))
	column = f"`tab{doctype}`.`{fieldname}`"
	if required:
		return f"{column} in ({quoted})"
	# Optional link: this company's rows, plus rows that were never tagged.
	return f"({column} in ({quoted}) OR {column} IS NULL OR {column} = '')"


def has_permission(doc=None, ptype=None, user=None, debug=False):
	if not doc:
		return True
	company = _document_company(doc)
	if not company:
		return True
	user = user or frappe.session.user
	if not user or user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return True
	companies = _user_companies(user)
	if companies is None:
		return True
	return cstr(company) in _companies_for_query(user, companies)


def _user_companies(user: str) -> list[str] | None:
	"""Companies from User Permission. ``None`` is only the Admin / System Manager bypass."""
	if not frappe.db.exists("DocType", "User Permission"):
		return None
	values = frappe.get_all(
		"User Permission",
		filters={"user": user, "allow": "Company"},
		pluck="for_value",
	)
	# No rows means no company. Administrator and System Manager never reach
	# this; they return earlier. An empty list must not fall open to every company.
	return [cstr(v) for v in values if v]


def _companies_for_query(user: str, companies: list[str]) -> list[str]:
	"""The company the user is in, when that company is one they may open.

	User Permission is the ceiling (an accountant may hold several). The header
	switcher is the company they are working in, so lists, reports and document
	reads follow that one company. With no usable choice, the ceiling stands.
	"""
	from taxmate.utils.company import get_default_company

	active = get_default_company(user)
	if active and active in companies:
		return [active]
	return companies


def _document_company(doc) -> str | None:
	getter = doc.get if hasattr(doc, "get") else None
	if getter is None:
		return None
	for key in ("company", "representative_company", "custom_company"):
		value = getter(key)
		if value:
			return cstr(value)
	return None
