"""SPA team admin. User is not a catalog resource.

1. Callers: taxmate/api/__init__.py get_catalog actions (~line 158) and
   get_session; frontend METHOD.listUsers / inviteUser; test_spa_users.py.
2. No taxmate/api/users.py exists (Glob empty). User is denied on
   resource.is_allowed_doctype — this is a dedicated whitelist, not CRUD.
3. User DocType fields: name=email (e.g. clerk@example.com), first_name,
   last_name, enabled 0|1, user_type=System User, send_welcome_email,
   last_active datetime, roles[].role. spa_role owner|accountant|clerk|viewer.
4. User: "how to manage the Users in the company and their roles? Keep
   users and roles simplified - an accounts business may not need every
   role. So backend could use a combination of role permissions for a
   frontend role. And we could have 3 or 4 roles in the frontend."
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, random_string, validate_email_address

from taxmate.api.resource import require_login
from taxmate.setup.spa_roles import SPA_ROLES, apply_spa_role, ensure_spa_roles, spa_role_of

_SKIP_USERS = frozenset({"Guest", "Administrator"})


def _require_owner() -> None:
	if spa_role_of() != "owner":
		frappe.throw(_("Only an Owner can manage the team"), frappe.PermissionError)


def _require_team_read() -> None:
	if spa_role_of() not in ("owner", "accountant"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _assert_mutable_user(user: str) -> None:
	if not user or user in _SKIP_USERS:
		frappe.throw(_("That user cannot be changed from TaxMate"))
	if "System Manager" in frappe.get_roles(user):
		frappe.throw(_("System managers cannot be changed from TaxMate"), frappe.PermissionError)


def _is_system_manager(user: str) -> bool:
	return bool(frappe.db.exists("Has Role", {"parent": user, "role": "System Manager"}))


def _as_user_row(name: str) -> dict[str, Any]:
	doc = frappe.get_doc("User", name)
	return {
		"name": doc.name,
		"email": doc.email or doc.name,
		"full_name": doc.full_name or doc.first_name or doc.name,
		"first_name": doc.first_name,
		"last_name": doc.last_name,
		"enabled": int(doc.enabled or 0),
		"spa_role": spa_role_of(doc.name),
		"last_active": str(doc.last_active) if doc.last_active else None,
	}


@frappe.whitelist()
def list_users() -> list[dict[str, Any]]:
	require_login()
	_require_team_read()
	ensure_spa_roles()

	rows = frappe.get_all(
		"User",
		filters={"user_type": "System User"},
		fields=["name"],
		order_by="enabled desc, full_name asc",
		ignore_permissions=True,
	)
	out: list[dict[str, Any]] = []
	for row in rows:
		if row.name in _SKIP_USERS or _is_system_manager(row.name):
			continue
		out.append(_as_user_row(row.name))
	return out


@frappe.whitelist(methods=["POST"])
def invite_user(
	email: str,
	first_name: str,
	spa_role: str = "clerk",
	last_name: str | None = None,
	send_welcome_email: int | str = 1,
) -> dict[str, Any]:
	require_login()
	_require_owner()
	ensure_spa_roles()

	email = (email or "").strip().lower()
	first_name = (first_name or "").strip()
	if not first_name:
		frappe.throw(_("First name is required"))
	validate_email_address(email, throw=True)
	if spa_role not in SPA_ROLES:
		frappe.throw(_("Unknown role"))
	if frappe.db.exists("User", email):
		frappe.throw(_("That user already exists"))

	welcome = cint(send_welcome_email)
	user = frappe.new_doc("User")
	user.email = email
	user.first_name = first_name
	user.last_name = (last_name or "").strip()
	user.user_type = "System User"
	user.enabled = 1
	user.send_welcome_email = welcome
	if not welcome:
		user.new_password = random_string(16)
		user.flags.no_welcome_mail = True
	user.insert(ignore_permissions=True)
	apply_spa_role(user.name, spa_role)
	return _as_user_row(user.name)


@frappe.whitelist(methods=["POST"])
def set_user_role(user: str, spa_role: str) -> dict[str, Any]:
	require_login()
	_require_owner()
	ensure_spa_roles()
	_assert_mutable_user(user)
	if user == frappe.session.user:
		frappe.throw(_("You cannot change your own role"))
	if spa_role not in SPA_ROLES:
		frappe.throw(_("Unknown role"))
	if not frappe.db.exists("User", user):
		frappe.throw(_("User not found"))

	apply_spa_role(user, spa_role)
	return _as_user_row(user)


@frappe.whitelist(methods=["POST"])
def set_user_enabled(user: str, enabled: int | str = 0) -> dict[str, Any]:
	require_login()
	_require_owner()
	_assert_mutable_user(user)
	if user == frappe.session.user:
		frappe.throw(_("You cannot disable yourself"))
	if not frappe.db.exists("User", user):
		frappe.throw(_("User not found"))

	doc = frappe.get_doc("User", user)
	doc.enabled = 1 if cint(enabled) else 0
	doc.save(ignore_permissions=True)
	frappe.clear_cache(user=user)
	return _as_user_row(user)
