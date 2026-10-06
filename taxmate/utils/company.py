"""The user's active company — what the header company switcher selects.

Every TaxMate screen, list, dashboard and new document works on ONE company at
a time. That company is resolved here, in this order:

1. ``taxmate_active_company`` — the user's choice in the header switcher. It is
   stored as a per-user DefaultValue under a TaxMate-only key, so it survives
   logout. (ERPNext's own ``company`` user default is a *session default*:
   ``clear_session_defaults`` wipes it on every logout, which is why the
   dashboard used to go blank after signing in again.)
2. Frappe's ``get_user_default("Company")`` — session default / global default,
   already filtered by the user's User Permissions.
3. The user's default Company User Permission, or the only one they have.

A stored choice the user can no longer open (permission removed, company
deleted) is ignored rather than trusted.
"""

from __future__ import annotations

import frappe
from frappe import _

ACTIVE_COMPANY_KEY = "taxmate_active_company"


def _permitted(user: str) -> list[str] | None:
	"""Company names from the user's User Permissions; ``None`` = unrestricted."""
	from frappe.core.doctype.user_permission.user_permission import get_user_permissions

	perms = get_user_permissions(user).get("Company") or []
	if not perms:
		return None
	return [p.get("doc") for p in perms if p.get("doc")]


def _unrestricted(user: str) -> bool:
	"""Administrator and System Manager, matching taxmate.uae.permissions."""
	if not user or user == "Guest":
		return False
	if user == "Administrator":
		return True
	return "System Manager" in frappe.get_roles(user)


def can_use_company(company: str | None, user: str | None = None) -> bool:
	user = user or frappe.session.user
	if not company or user == "Guest" or not frappe.db.exists("Company", company):
		return False
	if not _unrestricted(user):
		allowed = _permitted(user)
		if allowed is not None and company not in allowed:
			return False
	return bool(frappe.has_permission("Company", "read", company, user=user))


def user_companies(user: str | None = None) -> list[str]:
	"""Every company this user may switch to, in company-name order."""
	user = user or frappe.session.user
	if user == "Guest":
		return []
	allowed = None if _unrestricted(user) else _permitted(user)
	filters = {"name": ["in", allowed]} if allowed is not None else {}
	names = frappe.get_all("Company", filters=filters, pluck="name", order_by="company_name asc")
	return [n for n in names if frappe.has_permission("Company", "read", n, user=user)]


def get_active_company(user: str | None = None) -> str | None:
	"""The switcher's stored choice, if it is still usable."""
	user = user or frappe.session.user
	stored = frappe.defaults.get_defaults_for(user).get(ACTIVE_COMPANY_KEY)
	if isinstance(stored, list | tuple):
		stored = stored[0] if stored else None
	return stored if can_use_company(stored, user) else None


def get_default_company(user: str | None = None) -> str | None:
	user = user or frappe.session.user
	active = get_active_company(user)
	if active:
		return active

	company = frappe.defaults.get_user_default("Company", user=user)
	if company:
		return company

	from frappe.core.doctype.user_permission.user_permission import get_user_permissions

	perms = get_user_permissions(user).get("Company") or []
	for perm in perms:
		if perm.get("is_default"):
			return perm.get("doc")
	if len(perms) == 1:
		return perms[0].get("doc")
	return None


def set_active_company(company: str, user: str | None = None) -> str:
	"""Persist the switcher choice and align ERPNext's own default with it."""
	user = user or frappe.session.user
	if not can_use_company(company, user):
		frappe.throw(_("You do not have access to {0}").format(company), frappe.PermissionError)
	frappe.defaults.set_user_default(ACTIVE_COMPANY_KEY, company, user=user)
	# ERPNext server-side code (new documents, report filters, Desk) reads the
	# scrubbed ``company`` default. Keep it in step for this session.
	frappe.defaults.set_user_default("company", company, user=user)
	return company


def restore_active_company(login_manager=None) -> None:
	"""``on_session_creation``: re-apply the stored choice after logout cleared it."""
	user = getattr(login_manager, "user", None) or frappe.session.user
	if not user or user == "Guest":
		return
	active = get_active_company(user)
	if active and frappe.defaults.get_user_default("Company", user=user) != active:
		frappe.defaults.set_user_default("company", active, user=user)


def company_scoped(doctype: str) -> bool:
	"""True when every row of ``doctype`` belongs to exactly one company.

	Only a *mandatory* Link-to-Company field counts. Doctypes where company is
	optional (Lead, some templates) keep rows with a blank company that are
	shared across companies; filtering them on ``company =`` would hide those.
	"""
	if not doctype or doctype == "Company":
		return False
	meta = frappe.get_meta(doctype)
	field = meta.get_field("company")
	return bool(field and field.fieldtype == "Link" and field.options == "Company" and field.reqd)
