"""SPA team admin. User is not a catalog resource.

Invite, role, and enablement go through taxmate.api.users (see get_catalog).
SPA roles are owner, accountant, clerk, and viewer mapped onto marker Roles.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, random_string, validate_email_address

from taxmate.api.resource import require_login
from taxmate.setup.spa_roles import MARKER, SPA_ROLES, apply_spa_role, ensure_marker_roles, spa_role_of

_SKIP_USERS = frozenset({"Guest", "Administrator"})


def _require_owner() -> None:
	if spa_role_of() != "owner":
		frappe.throw(_("Admins manage the team"), frappe.PermissionError)


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
		"mobile_no": doc.mobile_no,
		"enabled": int(doc.enabled or 0),
		"spa_role": spa_role_of(doc.name),
		"last_active": str(doc.last_active) if doc.last_active else None,
	}


@frappe.whitelist()
def list_users() -> list[dict[str, Any]]:
	require_login()
	_require_team_read()
	ensure_marker_roles()

	names = {
		row.parent
		for row in frappe.get_all(
			"Has Role",
			filters={"role": ["in", list(MARKER.values())], "parenttype": "User"},
			fields=["parent"],
		)
	}
	out: list[dict[str, Any]] = []
	for name in sorted(names):
		if name in _SKIP_USERS or _is_system_manager(name):
			continue
		if not frappe.db.exists("User", name):
			continue
		out.append(_as_user_row(name))
	out.sort(key=lambda row: (0 if row.get("enabled") else 1, (row.get("full_name") or row["name"]).lower()))
	return out


@frappe.whitelist(methods=["POST"])
def invite_user(
	email: str,
	first_name: str,
	spa_role: str = "clerk",
	last_name: str | None = None,
	mobile_no: str | None = None,
	send_welcome_email: int | str = 1,
) -> dict[str, Any]:
	require_login()
	_require_owner()
	ensure_marker_roles()

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
	user.mobile_no = (mobile_no or "").strip()
	user.enabled = 1
	user.send_welcome_email = welcome
	user.redirect_url = "/taxmate"
	if hasattr(user, "default_app"):
		user.default_app = "taxmate"
	if not welcome:
		user.new_password = random_string(16)
		user.flags.no_welcome_mail = True
	user.insert(ignore_permissions=True)
	apply_spa_role(user.name, spa_role)
	company = frappe.defaults.get_user_default("Company")
	if company:
		frappe.defaults.set_user_default("Company", company, user.name)
	return _as_user_row(user.name)


@frappe.whitelist(methods=["POST"])
def set_user_role(user: str, spa_role: str) -> dict[str, Any]:
	require_login()
	_require_owner()
	ensure_marker_roles()
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


def _as_profile(user: str) -> dict[str, Any]:
	doc = frappe.get_doc("User", user)
	return {
		"name": doc.name,
		"email": doc.email or doc.name,
		"first_name": doc.first_name,
		"last_name": doc.last_name,
		"full_name": doc.full_name or doc.first_name or doc.name,
		"mobile_no": doc.mobile_no,
		"spa_role": spa_role_of(doc.name),
	}


@frappe.whitelist()
def get_profile() -> dict[str, Any]:
	require_login()
	return _as_profile(frappe.session.user)


@frappe.whitelist(methods=["POST"])
def update_profile(
	first_name: str,
	last_name: str | None = None,
	mobile_no: str | None = None,
) -> dict[str, Any]:
	require_login()
	user = frappe.session.user
	first_name = (first_name or "").strip()
	if not first_name:
		frappe.throw(_("First name is required"))

	doc = frappe.get_doc("User", user)
	doc.first_name = first_name
	doc.last_name = (last_name or "").strip()
	doc.mobile_no = (mobile_no or "").strip()
	doc.save(ignore_permissions=True)
	frappe.clear_cache(user=user)
	return _as_profile(user)


@frappe.whitelist(methods=["POST"])
def change_password(old_password: str, new_password: str) -> dict[str, str]:
	require_login()
	user = frappe.session.user
	old_password = old_password or ""
	new_password = new_password or ""
	if not old_password or not new_password:
		frappe.throw(_("Current and new password are required"))
	if old_password == new_password:
		frappe.throw(_("Choose a different password"))

	from frappe.auth import MAX_PASSWORD_SIZE
	from frappe.core.doctype.user.user import handle_password_test_fail, test_password_strength
	from frappe.utils.password import check_password, update_password

	if len(new_password) > MAX_PASSWORD_SIZE:
		frappe.throw(_("Password size exceeded the maximum allowed size."))
	feedback = test_password_strength(new_password).get("feedback")
	if feedback and not feedback.get("password_policy_validation_passed", False):
		handle_password_test_fail(feedback)

	check_password(user, old_password)
	logout_all = cint(frappe.get_system_settings("logout_on_password_reset"))
	update_password(user, new_password, logout_all_sessions=logout_all)
	return {"ok": "1"}
