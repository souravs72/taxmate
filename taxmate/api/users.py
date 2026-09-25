"""SPA team admin. User is not a catalog resource.

Invite, role, and enablement go through taxmate.api.users (see get_catalog).
SPA roles are owner, accountant, clerk, and viewer mapped onto marker Roles.
Users may hold multiple markers; Frappe unions DocPerms. Optional POSNext add-ons
are assignable when those Role docs exist on the site.

Callers: frontend TeamList/TeamInvite, taxmate.api.get_catalog actions,
test_spa_users. Schema: User Has Role child rows (Frappe union of DocPerms).
User: "roles could be multiple select rather than 1 role. And use frappe standard
for roles - union of permissions." Also POSNext sidebar when installed.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, random_string, validate_email_address

from taxmate.api.resource import require_login
from taxmate.setup.spa_roles import (
	ALL_MARKER_ROLE_NAMES,
	MARKER,
	SPA_ROLES,
	addon_roles_of,
	apply_spa_roles,
	available_addon_roles,
	ensure_marker_roles,
	spa_role_of,
	spa_roles_of,
)

_SKIP_USERS = frozenset({"Guest", "Administrator"})


def _require_owner() -> None:
	if spa_role_of() != "owner":
		frappe.throw(_("Admins manage the team"), frappe.PermissionError)


def _require_team_read() -> None:
	if spa_role_of() not in ("owner", "accountant"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)


def _assert_taxmate_teammate(user: str) -> None:
	"""Reject Desk-only / unrelated Users — Team APIs are TaxMate-marker scoped."""
	held = set(frappe.get_roles(user))
	if not held.intersection(ALL_MARKER_ROLE_NAMES):
		frappe.throw(_("User not found"))


def _assert_mutable_user(user: str) -> None:
	if not user or user in _SKIP_USERS:
		frappe.throw(_("That user cannot be changed from TaxMate"))
	if "System Manager" in frappe.get_roles(user):
		frappe.throw(_("System managers cannot be changed from TaxMate"), frappe.PermissionError)


def _is_system_manager(user: str) -> bool:
	return bool(frappe.db.exists("Has Role", {"parent": user, "role": "System Manager"}))


def _parse_spa_roles(
	spa_role: str | None = None,
	spa_roles: Any = None,
) -> list[str]:
	"""Accept spa_roles list/JSON/comma string, or legacy spa_role singular."""
	raw: Any = spa_roles
	if raw is None or raw == "" or raw == []:
		if spa_role:
			return [spa_role]
		frappe.throw(_("At least one role is required"))
	if isinstance(raw, str):
		text = raw.strip()
		if text.startswith("["):
			raw = frappe.parse_json(text)
		else:
			raw = [part.strip() for part in text.split(",") if part.strip()]
	if not isinstance(raw, (list, tuple)):
		frappe.throw(_("Unknown role"))
	out: list[str] = []
	for item in raw:
		name = str(item).strip()
		if not name:
			continue
		if name not in SPA_ROLES:
			frappe.throw(_("Unknown role"))
		if name not in out:
			out.append(name)
	if not out:
		frappe.throw(_("At least one role is required"))
	return out


def _parse_extra_roles(extra_roles: Any = None) -> list[str] | None:
	"""None means preserve existing add-ons; explicit list (incl. empty) replaces them."""
	if extra_roles is None:
		return None
	raw: Any = extra_roles
	if isinstance(raw, str):
		text = raw.strip()
		if not text:
			return []
		if text.startswith("["):
			raw = frappe.parse_json(text)
		else:
			raw = [part.strip() for part in text.split(",") if part.strip()]
	if not isinstance(raw, (list, tuple)):
		frappe.throw(_("Unknown role"))
	allowed = frozenset(available_addon_roles())
	out: list[str] = []
	for item in raw:
		name = str(item).strip()
		if not name:
			continue
		if name not in allowed:
			frappe.throw(_("Unknown role"))
		if name not in out:
			out.append(name)
	return out


def _as_user_row(name: str) -> dict[str, Any]:
	doc = frappe.get_doc("User", name)
	roles = spa_roles_of(doc.name)
	return {
		"name": doc.name,
		"email": doc.email or doc.name,
		"full_name": doc.full_name or doc.first_name or doc.name,
		"first_name": doc.first_name,
		"last_name": doc.last_name,
		"mobile_no": doc.mobile_no,
		"language": doc.language,
		"user_type": doc.user_type,
		"enabled": int(doc.enabled or 0),
		"spa_role": roles[0] if roles else spa_role_of(doc.name),
		"spa_roles": roles,
		"extra_roles": addon_roles_of(doc.name),
		"last_active": str(doc.last_active) if doc.last_active else None,
		"last_login": str(doc.last_login) if getattr(doc, "last_login", None) else None,
		"creation": str(doc.creation) if doc.creation else None,
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
			filters={"role": ["in", list(ALL_MARKER_ROLE_NAMES)], "parenttype": "User"},
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


@frappe.whitelist()
def get_user(user: str) -> dict[str, Any]:
	"""One teammate for the Team detail form (Frappe User fields + SPA roles)."""
	require_login()
	_require_team_read()
	ensure_marker_roles()
	user = (user or "").strip()
	if not user or user in _SKIP_USERS or _is_system_manager(user):
		frappe.throw(_("User not found"))
	if not frappe.db.exists("User", user):
		frappe.throw(_("User not found"))
	_assert_taxmate_teammate(user)
	return _as_user_row(user)


@frappe.whitelist(methods=["POST"])
def update_user(
	user: str,
	first_name: str,
	last_name: str | None = None,
	mobile_no: str | None = None,
	language: str | None = None,
) -> dict[str, Any]:
	"""Owner edits teammate identity fields (email stays the User name)."""
	require_login()
	_require_owner()
	_assert_mutable_user(user)
	if not frappe.db.exists("User", user):
		frappe.throw(_("User not found"))
	_assert_taxmate_teammate(user)

	first_name = (first_name or "").strip()
	if not first_name:
		frappe.throw(_("First name is required"))

	doc = frappe.get_doc("User", user)
	doc.first_name = first_name
	doc.last_name = (last_name or "").strip()
	doc.mobile_no = (mobile_no or "").strip()
	if language is not None:
		doc.language = (language or "").strip() or None
	doc.save(ignore_permissions=True)
	frappe.clear_cache(user=user)
	return _as_user_row(user)


@frappe.whitelist(methods=["POST"])
def reset_user_password(user: str) -> dict[str, str]:
	"""Send Frappe password-reset email to a teammate."""
	require_login()
	_require_owner()
	_assert_mutable_user(user)
	if user == frappe.session.user:
		frappe.throw(_("Use Profile to change your own password"))
	if not frappe.db.exists("User", user):
		frappe.throw(_("User not found"))
	_assert_taxmate_teammate(user)

	doc = frappe.get_doc("User", user)
	if not cint(doc.enabled):
		frappe.throw(_("Enable the user before resetting the password"))
	doc.validate_reset_password()
	doc._reset_password(send_email=True)
	return {"ok": "1"}


@frappe.whitelist(methods=["POST"])
def invite_user(
	email: str,
	first_name: str,
	spa_role: str | None = None,
	spa_roles: Any = None,
	extra_roles: Any = None,
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
	roles = _parse_spa_roles(spa_role=spa_role or ("clerk" if spa_roles is None else None), spa_roles=spa_roles)
	addons = _parse_extra_roles(extra_roles)
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
	apply_spa_roles(user.name, roles, extra_roles=addons if addons is not None else [])
	company = frappe.defaults.get_user_default("Company")
	if company:
		frappe.defaults.set_user_default("Company", company, user.name)
	return _as_user_row(user.name)


@frappe.whitelist(methods=["POST"])
def set_user_role(
	user: str,
	spa_role: str | None = None,
	spa_roles: Any = None,
	extra_roles: Any = None,
) -> dict[str, Any]:
	require_login()
	_require_owner()
	ensure_marker_roles()
	_assert_mutable_user(user)
	if user == frappe.session.user:
		frappe.throw(_("You cannot change your own role"))
	if not frappe.db.exists("User", user):
		frappe.throw(_("User not found"))
	_assert_taxmate_teammate(user)

	roles = _parse_spa_roles(spa_role=spa_role, spa_roles=spa_roles)
	addons = _parse_extra_roles(extra_roles)
	apply_spa_roles(user, roles, extra_roles=addons)
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
	_assert_taxmate_teammate(user)

	doc = frappe.get_doc("User", user)
	doc.enabled = 1 if cint(enabled) else 0
	doc.save(ignore_permissions=True)
	frappe.clear_cache(user=user)
	return _as_user_row(user)


def _as_profile(user: str) -> dict[str, Any]:
	doc = frappe.get_doc("User", user)
	roles = spa_roles_of(doc.name)
	return {
		"name": doc.name,
		"email": doc.email or doc.name,
		"first_name": doc.first_name,
		"last_name": doc.last_name,
		"full_name": doc.full_name or doc.first_name or doc.name,
		"mobile_no": doc.mobile_no,
		"spa_role": roles[0] if roles else spa_role_of(doc.name),
		"spa_roles": roles,
		"extra_roles": addon_roles_of(doc.name),
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
