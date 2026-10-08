"""TaxMate mobile app sign-in API (Capacitor app, header-only auth).

Sign-in returns a device token; the app then sends
``Authorization: TaxMate <token>`` on every request (see
taxmate.api.mobile_auth.validate, registered in hooks ``auth_hooks``).
No cookie session is ever created here.

E-mail codes are bound to an opaque *challenge* returned by ``request_code``
(or by ``login`` for two-factor users), never to the e-mail address, so a
code can only be tried against the challenge it was issued for.

Callers: frontend native boot / Sign in / UserMenu logout (mobile only).
Schema: TaxMate Mobile Device (sha256 of each token); TaxMate Settings
(mobile_email_code_login, optional min_app_version / latest_app_version).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import (
	add_to_date,
	cint,
	cstr,
	get_fullname,
	get_system_timezone,
	now_datetime,
	strip_html,
)

from taxmate.api import mobile_auth
from taxmate.api.resource import require_login

CODE_TTL_SEC = 10 * 60
CODE_MAX_ATTEMPTS = 3
DAILY_CODE_CAP = 10  # anonymous request_code, per e-mail
DAILY_PASSWORD_CODE_CAP = 20  # after a correct password, per user (own bucket)
DAY_SEC = 24 * 60 * 60
MAX_ACTIVE_DEVICES = 10
DEFAULT_APP_VERSION = "1.0.0"
PLATFORMS: tuple[str, ...] = ("android", "ios", "web")
SETTINGS_DOCTYPE = "TaxMate Settings"
EMAIL_CODE_FIELD = "mobile_email_code_login"

_INVALID_CODE = "That code is not valid or has expired."


# Sign-in refusals the app must show as-is. Frappe v16 puts the class name in the
# JSON error body as ``exc_type`` (frappe/utils/response.py report_error) and uses
# the class ``http_status_code`` for the HTTP status (frappe/app.py handle_exception).
class TwoFactorRequiredError(frappe.ValidationError):
	"""417. Two-factor auth is on for the user but e-mail codes are turned off."""


class PasswordLoginNotAllowedError(frappe.ValidationError):
	"""417. Username/password sign-in is turned off on this site."""


class PasswordExpiredError(frappe.ValidationError):
	"""417. Password is older than the site's forced-reset period."""


class EmailCodeLoginDisabledError(frappe.ValidationError):
	"""417. TaxMate Settings > mobile_email_code_login is off."""


class PasswordRequiredError(frappe.ValidationError):
	"""417. Two-factor user tried an e-mail-only challenge: sign in with the password."""


class AccountLockedError(frappe.AuthenticationError):
	"""401. Frappe's login-attempt lockout. Frappe raises SecurityException there,
	which has no http_status_code and would come back as HTTP 500."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _norm_email(email: Any) -> str:
	return cstr(email).strip().lower()[:254]


def _digest(value: str) -> str:
	return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _key(name: str) -> bytes:
	return frappe.cache.make_key(name)


def _challenge_key(challenge: str) -> bytes:
	return _key(f"taxmate:mch:{_digest(challenge)}")


def _challenge_attempts_key(challenge: str) -> bytes:
	return _key(f"taxmate:mch:n:{_digest(challenge)}")


def _code_hash(challenge: str, code: str) -> str:
	return _digest(f"{challenge}:{code}")


def _limit(bucket: str, identity: str, limit: int, seconds: int) -> None:
	"""Per-identity counter (normalised username), on top of the per-IP
	``frappe.rate_limiter.rate_limit``. Frappe's own ``key=`` option uses the raw
	form value, so ``A@x.com`` and ``a@x.com`` would get separate buckets."""
	if not identity:
		return
	key = _key(f"taxmate:rl:{bucket}:{_digest(identity)}")
	frappe.cache.set(key, 0, ex=seconds, nx=True)
	if cint(frappe.cache.incr(key)) > limit:
		frappe.throw(
			_("Too many attempts. Please wait a few minutes and try again."),
			frappe.RateLimitExceededError,
		)


def _under_daily_cap(identity: str, password_verified: bool) -> bool:
	"""Count one challenge; False beyond the daily cap for its bucket.

	Two separate buckets so anonymous ``request_code`` calls (anyone who knows an
	address) can never exhaust the codes a two-factor user needs after a correct
	password: anonymous → per e-mail, DAILY_CODE_CAP; password-verified → per
	user, DAILY_PASSWORD_CODE_CAP (only someone with the password can use it)."""
	if not identity:
		return False
	if password_verified:
		key, cap = _key(f"taxmate:mcode:pwday:{_digest(identity)}"), DAILY_PASSWORD_CODE_CAP
	else:
		key, cap = _key(f"taxmate:mcode:day:{_digest(identity)}"), DAILY_CODE_CAP
	frappe.cache.set(key, 0, ex=DAY_SEC, nx=True)
	return cint(frappe.cache.incr(key)) <= cap


def email_code_login_enabled() -> bool:
	"""TaxMate Settings > mobile_email_code_login (Check, default 1).

	Read straight from tabSingles: ``frappe.db.get_single_value`` casts a missing
	Check to 0 (database.py cast_fieldtype), and after migrate the new field has
	no row until the settings are saved — that must mean "on", the default."""
	try:
		if not frappe.get_meta(SETTINGS_DOCTYPE).has_field(EMAIL_CODE_FIELD):
			return True
		rows = frappe.db.sql(
			"select `value` from `tabSingles` where `doctype`=%s and `field`=%s",
			(SETTINGS_DOCTYPE, EMAIL_CODE_FIELD),
		)
	except Exception:
		return True
	if not rows or rows[0][0] in (None, ""):
		return True
	return bool(cint(rows[0][0]))


def _clean_device(device_id: Any, device_name: Any, platform: Any, app_version: Any) -> dict[str, str]:
	device_id = strip_html(cstr(device_id)).strip()[:140]
	if not device_id:
		frappe.throw(_("Device ID is required"), frappe.ValidationError)
	platform = cstr(platform).strip().lower()
	return {
		"device_id": device_id,
		"device_name": strip_html(cstr(device_name)).strip()[:140],
		"platform": platform if platform in PLATFORMS else "",
		"app_version": strip_html(cstr(app_version)).strip()[:20],
	}


def _eligible_user_for_email(email: str) -> dict | None:
	"""Enabled User with a TaxMate role for this e-mail, else None."""
	if not email or "@" not in email:
		return None
	row = frappe.db.get_value("User", {"email": email}, ["name", "email", "enabled"], as_dict=True)
	if not row or not cint(row.enabled) or not mobile_auth.has_mobile_access(row.name):
		return None
	return row


def _assert_sign_in_allowed(user: str, manager=None) -> None:
	"""IP allow-list and login hours, as Frappe's LoginManager.post_login does."""
	from frappe.auth import LoginManager, validate_ip_address

	validate_ip_address(user)
	if manager is None:
		manager = object.__new__(LoginManager)
	manager.user = user
	manager.validate_hour()


def _enforce_device_cap(user: str) -> None:
	"""Keep at most MAX_ACTIVE_DEVICES: revoke the least recently used before a new one."""
	active = frappe.get_all(
		mobile_auth.DEVICE_DOCTYPE,
		filters={"user": user, "revoked": 0, "expires_on": [">", now_datetime()]},
		fields=["name", "token_hash", "last_used_on"],
		order_by="last_used_on asc",
	)
	excess = len(active) - (MAX_ACTIVE_DEVICES - 1)
	if excess > 0:
		mobile_auth.revoke_rows(active[:excess])


def _issue(user: str, device: dict[str, str]) -> dict[str, str]:
	"""New device row + plain token (returned once, never stored)."""
	mobile_auth.revoke_user_devices(user, device_id=device["device_id"])
	_enforce_device_cap(user)

	token = secrets.token_urlsafe(32)
	now = now_datetime()
	expires_on = add_to_date(now, days=mobile_auth.TOKEN_TTL_DAYS)
	frappe.get_doc(
		{
			"doctype": mobile_auth.DEVICE_DOCTYPE,
			"owner": user,
			"user": user,
			"device_id": device["device_id"],
			"device_name": device["device_name"],
			"platform": device["platform"],
			"app_version": device["app_version"],
			"token_hash": mobile_auth.hash_token(token),
			"issued_on": now,
			"last_used_on": now,
			"expires_on": expires_on,
			"revoked": 0,
		}
	).insert(ignore_permissions=True)

	try:
		from frappe.core.doctype.activity_log.activity_log import add_authentication_log

		add_authentication_log(_("Signed in on the TaxMate app"), user)
	except Exception:
		pass

	return {
		"token": token,
		"user": user,
		"full_name": get_fullname(user),
		"expires_on": _iso_with_offset(expires_on),
	}


def _iso_with_offset(value) -> str:
	"""Naive system-timezone datetime (as now_datetime returns) → ISO 8601 with offset."""
	try:
		tz = ZoneInfo(get_system_timezone())
	except (ZoneInfoNotFoundError, ValueError):
		tz = ZoneInfo("UTC")
	return value.replace(tzinfo=tz).isoformat(timespec="seconds")


def _after_response(fn) -> None:
	"""Run ``fn`` after the response is sent (own commit); inline outside a request."""
	request = getattr(frappe.local, "request", None)
	callbacks = getattr(request, "after_response", None)
	if callbacks is None:
		fn()
		return

	def _run() -> None:
		fn()
		frappe.db.commit()

	callbacks.add(_run)


def _code_email_html(code: str) -> str:
	return f"""<!DOCTYPE html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5">
<p>Your TaxMate sign-in code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{code}</p>
<p>It expires in 10 minutes. If you did not ask for it, you can ignore this e-mail.</p>
<hr style="border:none;border-top:1px solid #e5e7eb">
<div dir="rtl" lang="ar">
<p>رمز تسجيل الدخول إلى TaxMate هو:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{code}</p>
<p>ينتهي خلال 10 دقائق. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.</p>
</div>
</body></html>"""


def _send_code(recipient: str, code: str) -> None:
	"""Send after the response so the reply takes the same time whether or not
	the address exists (no timing-based enumeration from the SMTP round trip).
	``raw_html`` skips the standard footer (which says "Sent via ERPNext");
	``redact_message_after_send`` keeps the code out of Email Queue."""

	def _send() -> None:
		frappe.sendmail(
			recipients=[recipient],
			subject="Your TaxMate sign-in code",
			message=_code_email_html(code),
			raw_html=True,
			add_unsubscribe_link=0,
			now=True,
			redact_message_after_send=True,
		)

	_after_response(_send)


def _start_challenge(cap_key: str, user: str | None, recipient: str | None, password_verified: bool) -> str:
	"""Always returns a fresh opaque challenge. A code is stored and mailed only
	for a real user still under the daily cap; otherwise the challenge is inert."""
	challenge = secrets.token_urlsafe(32)
	under_cap = _under_daily_cap(cap_key, password_verified)
	if not user or not recipient or not under_cap:
		return challenge
	code = f"{secrets.randbelow(1_000_000):06d}"
	frappe.cache.set(
		_challenge_key(challenge),
		json.dumps({"h": _code_hash(challenge, code), "u": user, "pw": 1 if password_verified else 0}),
		ex=CODE_TTL_SEC,
	)
	frappe.cache.set(_challenge_attempts_key(challenge), 0, ex=CODE_TTL_SEC)
	_send_code(recipient, code)
	return challenge


def _consume_challenge(challenge: str, code: str) -> dict | None:
	"""Challenge data for a valid code (single use), else None. Every try counts;
	the challenge is burned after CODE_MAX_ATTEMPTS wrong tries."""
	if not challenge:
		return None
	key = _challenge_key(challenge)
	attempts_key = _challenge_attempts_key(challenge)
	raw = frappe.cache.get(key)
	if not raw:
		return None
	try:
		data = json.loads(raw)
	except (TypeError, ValueError):
		frappe.cache.delete(key, attempts_key)
		return None

	frappe.cache.set(attempts_key, 0, ex=CODE_TTL_SEC, nx=True)
	attempts = cint(frappe.cache.incr(attempts_key))
	if attempts > CODE_MAX_ATTEMPTS:
		frappe.cache.delete(key, attempts_key)
		return None

	candidate = code if (len(code) == 6 and code.isdigit()) else ""
	if not candidate or not hmac.compare_digest(cstr(data.get("h")), _code_hash(challenge, candidate)):
		if attempts >= CODE_MAX_ATTEMPTS:
			frappe.cache.delete(key, attempts_key)
		return None

	# Single use: only the request that actually deletes the key may sign in.
	if not frappe.cache.delete(key):
		return None
	frappe.cache.delete(attempts_key)
	return data if data.get("u") else None


def _invalid_code() -> None:
	frappe.throw(_(_INVALID_CODE), frappe.AuthenticationError)


def _email_codes_off() -> None:
	frappe.throw(
		_("Sign-in with an e-mail code is turned off for this workspace. Sign in with your password."),
		EmailCodeLoginDisabledError,
	)


# ---------------------------------------------------------------------------
# Whitelisted API
# ---------------------------------------------------------------------------


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def request_code(email: str) -> dict[str, Any]:
	"""Start an e-mail code challenge. Always ``{"ok": true, "challenge": "..."}``
	for any address (no enumeration); unknown, ineligible or over-cap addresses
	get an inert challenge and no e-mail."""
	if not email_code_login_enabled():
		_email_codes_off()
	email = _norm_email(email)
	row = _eligible_user_for_email(email)
	challenge = _start_challenge(
		email,
		row.name if row else None,
		(row.email or email) if row else None,
		password_verified=False,
	)
	return {"ok": True, "challenge": challenge}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60 * 60)
def verify_code(
	challenge: str,
	code: str,
	device_id: str,
	device_name: str | None = None,
	platform: str | None = None,
	app_version: str | None = None,
) -> dict[str, str]:
	from frappe.twofactor import should_run_2fa

	device = _clean_device(device_id, device_name, platform, app_version)
	data = _consume_challenge(cstr(challenge).strip()[:128], cstr(code).strip())
	if not data:
		_invalid_code()
	user = cstr(data.get("u"))
	password_verified = bool(cint(data.get("pw")))
	if not cint(frappe.db.get_value("User", user, "enabled")) or not mobile_auth.has_mobile_access(user):
		_invalid_code()
	if not password_verified and not email_code_login_enabled():
		_email_codes_off()
	if not password_verified and should_run_2fa(user):
		frappe.throw(
			_("Your account also needs your password. Sign in with your password."),
			PasswordRequiredError,
		)
	_assert_sign_in_allowed(user)
	return _issue(user, device)


@frappe.whitelist(allow_guest=True, methods=["POST"], xss_safe=True)
@rate_limit(limit=30, seconds=60 * 60)
def login(
	usr: str,
	pwd: str,
	device_id: str,
	device_name: str | None = None,
	platform: str | None = None,
	app_version: str | None = None,
) -> dict[str, Any]:
	"""Password sign-in through Frappe's own checks, without a cookie session.

	Two-factor users get ``{"needs_code": true, "challenge": "..."}`` and an
	e-mailed code; they finish with ``verify_code``.

	``xss_safe``: guest form values are otherwise HTML-sanitised by Frappe,
	which would alter passwords containing ``<...>``. Device fields are
	stripped of tags in ``_clean_device``.
	"""
	from frappe.auth import LoginManager
	from frappe.twofactor import should_run_2fa

	# LoginManager.authenticate skips the per-user lockout tracker when "otp" is
	# in form_dict (and tmp_id selects cached credentials in Frappe's 2FA flow).
	frappe.form_dict.pop("otp", None)
	frappe.form_dict.pop("tmp_id", None)

	usr = cstr(usr).strip()
	_limit("login", usr.lower(), 10, 15 * 60)
	device = _clean_device(device_id, device_name, platform, app_version)

	if cint(frappe.get_system_settings("disable_user_pass_login")):
		frappe.throw(
			_("Password sign-in is turned off for this workspace. Use the e-mail code instead."),
			PasswordLoginNotAllowedError,
		)

	# LoginManager() would resume / create a session from the request; a bare
	# instance only runs authenticate(): User.find_by_credentials, the IP and
	# user LoginAttemptTracker (lockout), enabled check and failure logging.
	manager = object.__new__(LoginManager)
	manager.user = None
	try:
		manager.authenticate(user=usr, pwd=cstr(pwd))
	except frappe.SecurityException as e:
		frappe.throw(cstr(e) or _("Too many failed attempts. Try again later."), AccountLockedError)
	user = manager.user

	if manager.force_user_to_reset_password():
		frappe.throw(
			_("Your password has expired. Reset it from the web sign-in page, then try again."),
			PasswordExpiredError,
		)
	if not mobile_auth.has_mobile_access(user):
		frappe.throw(_("This account cannot use the TaxMate app."), frappe.AuthenticationError)
	_assert_sign_in_allowed(user, manager)

	if should_run_2fa(user):
		if not email_code_login_enabled():
			frappe.throw(
				_(
					"Your account needs a second sign-in step, but e-mail codes are turned off for this "
					"workspace. Ask your administrator."
				),
				TwoFactorRequiredError,
			)
		recipient = cstr(frappe.db.get_value("User", user, "email")) or user
		challenge = _start_challenge(user, user, recipient, password_verified=True)
		return {"needs_code": True, "challenge": challenge}

	return _issue(user, device)


@frappe.whitelist(methods=["POST"])
def logout() -> dict[str, bool]:
	"""Revoke the device token used for this request."""
	require_login()
	name = mobile_auth.current_device()
	if name:
		mobile_auth.revoke_device(name)
	return {"ok": True}


@frappe.whitelist(methods=["GET"])
def my_devices() -> dict[str, list[dict[str, Any]]]:
	require_login()
	current = mobile_auth.current_device()
	rows = frappe.get_all(
		mobile_auth.DEVICE_DOCTYPE,
		filters={
			"user": frappe.session.user,
			"revoked": 0,
			"expires_on": [">", now_datetime()],
		},
		fields=["name", "device_name", "platform", "app_version", "last_used_on", "issued_on"],
		order_by="last_used_on desc",
	)
	return {
		"devices": [
			{
				"name": row.name,
				"device_name": row.device_name or "",
				"platform": row.platform or "",
				"app_version": row.app_version or "",
				"last_used_on": str(row.last_used_on) if row.last_used_on else None,
				"issued_on": str(row.issued_on) if row.issued_on else None,
				"current": row.name == current,
			}
			for row in rows
		]
	}


@frappe.whitelist(methods=["POST"])
def revoke_device(name: str) -> dict[str, bool]:
	"""Revoke one of your own devices (System Manager: any device)."""
	require_login()
	owner = frappe.db.get_value(mobile_auth.DEVICE_DOCTYPE, cstr(name), "user")
	if not owner or (owner != frappe.session.user and "System Manager" not in frappe.get_roles()):
		frappe.throw(_("Device not found"), frappe.DoesNotExistError)
	mobile_auth.revoke_device(cstr(name))
	return {"ok": True, "current": cstr(name) == mobile_auth.current_device()}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def app_config() -> dict[str, Any]:
	"""Workspace check before sign-in, and later forced update. Nothing internal."""
	out: dict[str, Any] = {
		"min_app_version": DEFAULT_APP_VERSION,
		"latest_app_version": DEFAULT_APP_VERSION,
		"site_ok": True,
		"email_code_login": email_code_login_enabled(),
	}
	try:
		meta = frappe.get_meta(SETTINGS_DOCTYPE)
		for field in ("min_app_version", "latest_app_version"):
			if meta.has_field(field):
				value = cstr(frappe.db.get_single_value(SETTINGS_DOCTYPE, field)).strip()
				if value:
					out[field] = value
	except Exception:
		pass
	return out
