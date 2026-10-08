"""Device-token authentication for the TaxMate mobile app.

The app sends ``Authorization: TaxMate <device_token>`` on every request and
never carries cookies. Frappe v16 ``frappe.auth.validate_auth`` splits that
header on a single space; OAuth only handles ``Bearer`` and API keys only
``token``/``basic``, then every ``auth_hooks`` entry runs (``validate`` below).
When the header has two parts and the user is still Guest afterwards, Frappe
raises ``AuthenticationError`` itself, so rejecting a token here means simply
returning without calling ``frappe.set_user``.

Only ``sha256(token)`` is stored, on ``TaxMate Mobile Device``. Positive
lookups are cached in Redis for ``LOOKUP_TTL_SEC`` and dropped on revoke.

Callers: hooks.py ``auth_hooks``, User ``doc_events``, ``scheduler_events``
daily (cleanup_devices) and ``override_whitelisted_methods`` (update_password);
taxmate.api.mobile (issue / revoke); TaxMate Mobile Device controller.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import frappe
from frappe.utils import add_to_date, cint, get_datetime, getdate, now_datetime

from taxmate.setup.spa_roles import ALL_MARKER_ROLE_NAMES

SCHEME = "taxmate"
DEVICE_DOCTYPE = "TaxMate Mobile Device"
TOKEN_TTL_DAYS = 90
LOOKUP_TTL_SEC = 60
TOUCH_EVERY_SEC = 60 * 60
CLEANUP_AFTER_DAYS = 30

# System Manager is "owner" in the SPA (spa_roles.spa_roles_of); same set as
# taxmate.api.permission.has_app_permission minus its Desk-permission fallback.
MOBILE_ROLES: frozenset[str] = frozenset({*ALL_MARKER_ROLE_NAMES, "System Manager"})
_NO_MOBILE_USERS: frozenset[str] = frozenset({"", "Guest", "Administrator"})


# ---------------------------------------------------------------------------
# Small helpers shared with taxmate.api.mobile
# ---------------------------------------------------------------------------


def hash_token(token: str) -> str:
	return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


def has_mobile_access(user: str | None) -> bool:
	"""Enabled-ness is checked separately. Administrator never gets a device token."""
	if not user or user in _NO_MOBILE_USERS:
		return False
	return bool(MOBILE_ROLES.intersection(frappe.get_roles(user)))


def read_token_from_header() -> str | None:
	"""Token from ``Authorization: TaxMate <token>``; None for any other header.

	Splits exactly like ``frappe.auth.validate_auth`` (single space, two parts)
	so a header Frappe does not treat as two-part is never authenticated here.
	"""
	request = getattr(frappe.local, "request", None)
	if request is None:
		return None
	header = frappe.get_request_header("Authorization", "") or ""
	parts = header.split(" ")
	if len(parts) != 2 or parts[0].lower() != SCHEME or not parts[1]:
		return None
	return parts[1]


def _cache_key(name: str) -> bytes:
	return frappe.cache.make_key(name)


def _lookup_key(token_hash: str) -> bytes:
	return _cache_key(f"taxmate:mdev:{token_hash}")


def forget_token_hash(token_hash: str | None) -> None:
	"""Drop the cached positive lookup now and again after commit.

	The second drop closes the window where a parallel request re-reads the
	not-yet-committed (still active) row and caches it for another minute.
	"""
	if not token_hash:
		return

	def _drop() -> None:
		try:
			frappe.cache.delete(_lookup_key(token_hash))
		except Exception:
			pass

	_drop()
	db = getattr(frappe.local, "db", None)
	if db is not None and getattr(db, "after_commit", None) is not None:
		db.after_commit.add(_drop)


# ---------------------------------------------------------------------------
# Revocation
# ---------------------------------------------------------------------------


def revoke_rows(rows: list[dict[str, Any]]) -> int:
	"""Revoke the given ``{name, token_hash}`` rows and drop their cached lookups."""
	now = now_datetime()
	for row in rows:
		frappe.db.set_value(
			DEVICE_DOCTYPE,
			row["name"],
			{"revoked": 1, "revoked_on": now},
			update_modified=False,
		)
		forget_token_hash(row.get("token_hash"))
	return len(rows)


def revoke_device(name: str) -> bool:
	rows = frappe.get_all(
		DEVICE_DOCTYPE,
		filters={"name": name, "revoked": 0},
		fields=["name", "token_hash"],
	)
	return bool(revoke_rows(rows))


def revoke_user_devices(user: str, keep: str | None = None, device_id: str | None = None) -> int:
	"""Revoke every active device of ``user`` (optionally one ``device_id``), except ``keep``."""
	filters: dict[str, Any] = {"user": user, "revoked": 0}
	if device_id is not None:
		filters["device_id"] = device_id
	rows = frappe.get_all(DEVICE_DOCTYPE, filters=filters, fields=["name", "token_hash"])
	if keep:
		rows = [row for row in rows if row["name"] != keep]
	return revoke_rows(rows)


# ---------------------------------------------------------------------------
# auth_hooks entry point
# ---------------------------------------------------------------------------


def _load_device(token_hash: str) -> dict[str, Any] | None:
	"""Active device for this hash, from cache or DB. None when unusable."""
	key = _lookup_key(token_hash)
	cached = None
	try:
		cached = frappe.cache.get(key)
	except Exception:
		cached = None
	if cached:
		try:
			return json.loads(cached)
		except (TypeError, ValueError):
			pass

	row = frappe.db.get_value(
		DEVICE_DOCTYPE,
		{"token_hash": token_hash, "revoked": 0},
		["name", "user", "token_hash", "issued_on", "expires_on"],
		as_dict=True,
	)
	if not row or not hmac.compare_digest(str(row.token_hash or ""), token_hash):
		return None
	user = frappe.db.get_value("User", row.user, ["enabled", "last_password_reset_date"], as_dict=True)
	if not user or not cint(user.enabled):
		return None
	# Password reset by e-mail link / taxmate.api.users.change_password does not
	# save the User doc (no doc_events); Frappe stamps last_password_reset_date.
	if user.last_password_reset_date and row.issued_on:
		if getdate(user.last_password_reset_date) > getdate(row.issued_on):
			return None

	data = {
		"name": row.name,
		"user": row.user,
		"expires_on": str(get_datetime(row.expires_on)) if row.expires_on else "",
	}
	try:
		frappe.cache.set(key, json.dumps(data), ex=LOOKUP_TTL_SEC)
	except Exception:
		pass
	return data


def validate() -> None:
	"""``auth_hooks`` entry. No-op unless the header scheme is ``TaxMate``."""
	token = read_token_from_header()
	if token is None:
		return

	device = _load_device(hash_token(token))
	if not device:
		return
	expires_on = device.get("expires_on")
	if not expires_on or get_datetime(expires_on) <= now_datetime():
		return
	user = device["user"]
	# Cheap per-request re-checks (document cache / role cache), so a user
	# disabled with db.set_value or stripped of roles is refused at once.
	if not cint(frappe.get_cached_value("User", user, "enabled")):
		return
	if not has_mobile_access(user):
		return

	# frappe.set_user resets local.form_dict (frappe/__init__.py set_user); keep
	# the request args, as frappe.auth.validate_api_key_secret does.
	form_dict = frappe.local.form_dict
	frappe.set_user(user)
	frappe.local.form_dict = form_dict
	frappe.local.taxmate_device = device["name"]
	_schedule_touch(device["name"])


def current_device() -> str | None:
	return getattr(frappe.local, "taxmate_device", None)


# ---------------------------------------------------------------------------
# Sliding expiry (at most one write per device per hour)
# ---------------------------------------------------------------------------


def _schedule_touch(name: str) -> None:
	"""Extend ``last_used_on`` / ``expires_on`` at most once per TOUCH_EVERY_SEC.

	Frappe rolls back GET requests (app.sync_database) and any request that
	raises, so the write runs in an after-response callback with its own
	commit — independent of the request transaction and off the response path.
	The Redis ``SET NX EX`` gate keeps it to one write per device per hour
	across all workers.
	"""
	try:
		first = frappe.cache.set(_cache_key(f"taxmate:mdev:touch:{name}"), 1, ex=TOUCH_EVERY_SEC, nx=True)
	except Exception:
		return
	if not first:
		return
	request = getattr(frappe.local, "request", None)
	callbacks = getattr(request, "after_response", None)
	if callbacks is None:
		touch_device(name, commit=False)
		return
	callbacks.add(lambda: touch_device(name, commit=True))


def touch_device(name: str, commit: bool = False) -> None:
	now = now_datetime()
	frappe.db.set_value(
		DEVICE_DOCTYPE,
		{"name": name, "revoked": 0},
		{"last_used_on": now, "expires_on": add_to_date(now, days=TOKEN_TTL_DAYS)},
		update_modified=False,
	)
	if commit:
		frappe.db.commit()


# ---------------------------------------------------------------------------
# User doc_events
# ---------------------------------------------------------------------------


def user_before_validate(doc, method=None) -> None:
	"""``new_password`` is cleared in User.validate; note it before that runs."""
	if doc.get("new_password") and not doc.is_new():
		doc.flags.taxmate_password_changed = True


def user_on_update(doc, method=None) -> None:
	"""Disabled user or changed password → sign out all mobile devices."""
	if not cint(doc.enabled):
		revoke_user_devices(doc.name)
		return
	if doc.flags.get("taxmate_password_changed"):
		keep = current_device() if doc.name == frappe.session.user else None
		revoke_user_devices(doc.name, keep=keep)


def user_on_trash(doc, method=None) -> None:
	"""Remove device rows so the User Link does not block deleting the user."""
	for row in frappe.get_all(DEVICE_DOCTYPE, filters={"user": doc.name}, fields=["name", "token_hash"]):
		forget_token_hash(row.token_hash)
		frappe.db.delete(DEVICE_DOCTYPE, {"name": row.name})


# ---------------------------------------------------------------------------
# Scheduler (hooks scheduler_events "daily")
# ---------------------------------------------------------------------------


def cleanup_devices() -> int:
	"""Delete device rows revoked or expired more than CLEANUP_AFTER_DAYS ago.

	The background job runner commits (frappe.utils.background_jobs.execute_job)."""
	cutoff = add_to_date(now_datetime(), days=-CLEANUP_AFTER_DAYS)
	names = set(
		frappe.get_all(DEVICE_DOCTYPE, filters={"revoked": 1, "revoked_on": ["<", cutoff]}, pluck="name")
	)
	names.update(frappe.get_all(DEVICE_DOCTYPE, filters={"expires_on": ["<", cutoff]}, pluck="name"))
	for name in names:
		frappe.db.delete(DEVICE_DOCTYPE, {"name": name})
	return len(names)


# ---------------------------------------------------------------------------
# Password reset wrapper (hooks override_whitelisted_methods)
# ---------------------------------------------------------------------------


@frappe.whitelist(allow_guest=True, methods=["POST"])
def update_password(
	new_password: str,
	logout_all_sessions: int = 0,
	key: str | None = None,
	old_password: str | None = None,
):
	"""Override of ``frappe.core.doctype.user.user.update_password`` (reset link and
	Desk "change password"): same signature, decorators and return value; after a
	successful change, every mobile device of that user is revoked.

	Frappe signals a bad/expired reset key by returning a message with
	``response.http_status_code = 410`` (no exception) — then nothing is revoked.
	The original does not save the User with ``new_password`` (no doc_events)."""
	from frappe.core.doctype.user.user import update_password as frappe_update_password
	from frappe.utils import sha256_hash

	keep = None
	if key:
		# Same lookup as frappe ..._get_user_for_update_password; no side effects.
		user = frappe.db.get_value("User", {"reset_password_key": sha256_hash(key)}, "name")
	elif old_password:
		user = frappe.session.user
		keep = current_device()
	else:
		user = None

	result = frappe_update_password(
		new_password=new_password,
		logout_all_sessions=logout_all_sessions,
		key=key,
		old_password=old_password,
	)
	if user and user not in _NO_MOBILE_USERS and frappe.local.response.get("http_status_code") != 410:
		revoke_user_devices(user, keep=keep)
	return result
