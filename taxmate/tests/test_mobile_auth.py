"""TaxMate mobile app sign-in: e-mail code challenge, password, device tokens, auth hook.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_mobile_auth
"""

from __future__ import annotations

import re
import uuid
from contextlib import contextmanager
from datetime import datetime
from unittest import mock

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime, sha256_hash
from frappe.utils.password import update_password
from werkzeug.test import EnvironBuilder
from werkzeug.wrappers import Request

from taxmate.api import mobile, mobile_auth
from taxmate.api.users import change_password, invite_user
from taxmate.setup.spa_roles import ensure_spa_roles

PASSWORD = "Tm-Mobile-Test-9!xQ"


class TestMobileAuth(FrappeTestCase):
	def setUp(self):
		ensure_spa_roles()
		frappe.set_user("Administrator")
		frappe.local.request_ip = "127.0.0.1"
		self.email = f"tm-mobile-{uuid.uuid4().hex[:8]}@example.com"
		invite_user(
			email=self.email,
			first_name="Mobile",
			last_name="Tester",
			spa_role="clerk",
			send_welcome_email=0,
		)
		update_password(self.email, PASSWORD)
		self.mail = []
		patcher = mock.patch("frappe.sendmail", side_effect=lambda **kw: self.mail.append(kw))
		patcher.start()
		self.addCleanup(patcher.stop)
		self.addCleanup(self._cleanup)

	def _cleanup(self):
		frappe.set_user("Administrator")
		frappe.local.taxmate_device = None
		if frappe.db.exists("User", self.email):
			frappe.delete_doc("User", self.email, force=True, ignore_permissions=True)

	# -- helpers -----------------------------------------------------------

	@contextmanager
	def _request(self, authorization: str | None = None, method: str = "GET"):
		"""A werkzeug request on frappe.local so the auth hook can read headers."""
		headers = {"Authorization": authorization} if authorization else {}
		had_request = hasattr(frappe.local, "request")
		old = getattr(frappe.local, "request", None)
		frappe.local.request = Request(EnvironBuilder(method=method, headers=headers).get_environ())
		try:
			yield
		finally:
			# validate_ip_address does `hasattr(local, "request") and local.request.path`,
			# so never leave request=None behind.
			if had_request:
				frappe.local.request = old
			else:
				del frappe.local.request

	def _as_guest_hook(self, authorization: str | None) -> str:
		frappe.set_user("Guest")
		frappe.local.taxmate_device = None
		with self._request(authorization):
			mobile_auth.validate()
		return frappe.session.user

	def _last_code(self) -> str:
		return re.search(r"\b(\d{6})\b", self.mail[-1]["message"]).group(1)

	def _challenge(self, email: str | None = None) -> str:
		frappe.set_user("Guest")
		out = mobile.request_code(email or self.email)
		self.assertEqual(set(out), {"ok", "challenge"})
		return out["challenge"]

	def _code_login(self, device_id: str = "dev-1") -> dict:
		challenge = self._challenge(self.email.upper())
		body = self.mail[-1]["message"]
		self.assertNotIn("ERPNext", body)
		self.assertNotIn("Frappe", body)
		return mobile.verify_code(challenge, self._last_code(), device_id, "Pixel", "android", "1.0.0")

	def _set_2fa(self, on: bool = True):
		return mock.patch("frappe.twofactor.should_run_2fa", return_value=on)

	# -- e-mail code -------------------------------------------------------

	def test_request_code_never_enumerates(self):
		out = mobile.request_code("nobody-" + self.email)
		self.assertTrue(out["ok"])
		self.assertGreaterEqual(len(out["challenge"]), 32)
		self.assertEqual(self.mail, [])
		with self.assertRaises(frappe.AuthenticationError):
			mobile.verify_code(out["challenge"], "123456", "dev-x")
		frappe.db.set_value("User", self.email, "enabled", 0)
		out = mobile.request_code(self.email)
		self.assertEqual(set(out), {"ok", "challenge"})
		self.assertEqual(self.mail, [])

	def test_code_success_issues_token_once(self):
		out = self._code_login()
		self.assertEqual(out["user"], self.email)
		self.assertIsNotNone(datetime.fromisoformat(out["expires_on"]).tzinfo)
		row = frappe.get_all(mobile_auth.DEVICE_DOCTYPE, filters={"user": self.email}, fields=["token_hash"])
		self.assertEqual(len(row), 1)
		self.assertEqual(row[0].token_hash, mobile_auth.hash_token(out["token"]))

	def test_code_bound_to_challenge_single_use(self):
		first = self._challenge()
		first_code = self._last_code()
		second = self._challenge()
		with self.assertRaises(frappe.AuthenticationError):
			mobile.verify_code(second, first_code, "dev-1")
		mobile.verify_code(first, first_code, "dev-1")
		with self.assertRaises(frappe.AuthenticationError):
			mobile.verify_code(first, first_code, "dev-2")

	def test_three_wrong_codes_burn_it(self):
		challenge = self._challenge()
		code = self._last_code()
		wrong = "000000" if code != "000000" else "111111"
		for _ in range(mobile.CODE_MAX_ATTEMPTS):
			with self.assertRaises(frappe.AuthenticationError):
				mobile.verify_code(challenge, wrong, "dev-1")
		with self.assertRaises(frappe.AuthenticationError):
			mobile.verify_code(challenge, code, "dev-1")

	def test_daily_cap_silently_stops_mail(self):
		for _ in range(mobile.DAILY_CODE_CAP):
			self._challenge()
		self.assertEqual(len(self.mail), mobile.DAILY_CODE_CAP)
		out = mobile.request_code(self.email)
		self.assertTrue(out["ok"])
		self.assertEqual(len(self.mail), mobile.DAILY_CODE_CAP)

	def test_anonymous_cap_does_not_block_password_code(self):
		for _ in range(mobile.DAILY_CODE_CAP + 2):
			self._challenge()
		sent = len(self.mail)
		self.assertEqual(sent, mobile.DAILY_CODE_CAP)
		frappe.set_user("Guest")
		with self._set_2fa():
			step = mobile.login(self.email, PASSWORD, "dev-2fa")
			self.assertEqual(len(self.mail), sent + 1)
			out = mobile.verify_code(step["challenge"], self._last_code(), "dev-2fa")
		self.assertEqual(out["user"], self.email)

	def test_email_code_switch(self):
		with mock.patch("taxmate.api.mobile.email_code_login_enabled", return_value=False):
			with self.assertRaises(mobile.EmailCodeLoginDisabledError):
				mobile.request_code(self.email)
			self.assertFalse(mobile.app_config()["email_code_login"])

	def test_two_factor_needs_password_verified_challenge(self):
		with self._set_2fa():
			challenge = self._challenge()
			with self.assertRaises(mobile.PasswordRequiredError) as ctx:
				mobile.verify_code(challenge, self._last_code(), "dev-1")
			self.assertEqual(ctx.exception.http_status_code, 417)

			frappe.set_user("Guest")
			step = mobile.login(self.email, PASSWORD, "dev-2")
			self.assertEqual(set(step), {"needs_code", "challenge"})
			out = mobile.verify_code(step["challenge"], self._last_code(), "dev-2")
			self.assertEqual(out["user"], self.email)

	# -- password ----------------------------------------------------------

	def test_password_login_no_cookie_session(self):
		frappe.set_user("Guest")
		out = mobile.login(self.email, PASSWORD, "dev-pw", "iPhone", "ios", "1.0.0")
		self.assertEqual(out["user"], self.email)
		self.assertEqual(frappe.session.user, "Guest")
		with self.assertRaises(frappe.AuthenticationError):
			mobile.login(self.email, "wrong-password", "dev-pw")

	def test_login_pops_otp_and_tmp_id(self):
		frappe.set_user("Guest")
		frappe.local.form_dict = frappe._dict(otp="123456", tmp_id="abc")
		mobile.login(self.email, PASSWORD, "dev-pw")
		self.assertNotIn("otp", frappe.local.form_dict)
		self.assertNotIn("tmp_id", frappe.local.form_dict)

	def test_two_factor_with_codes_off_is_417(self):
		frappe.set_user("Guest")
		with self._set_2fa(), mock.patch("taxmate.api.mobile.email_code_login_enabled", return_value=False):
			with self.assertRaises(mobile.TwoFactorRequiredError) as ctx:
				mobile.login(self.email, PASSWORD, "dev-pw")
		self.assertEqual(ctx.exception.http_status_code, 417)
		self.assertNotIsInstance(ctx.exception, frappe.AuthenticationError)

	# -- auth hook ---------------------------------------------------------

	def test_hook_accepts_valid_and_ignores_other_schemes(self):
		token = self._code_login()["token"]
		self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), self.email)
		self.assertTrue(frappe.local.taxmate_device)
		self.assertEqual(self._as_guest_hook(f"taxmate {token}"), self.email)
		self.assertEqual(self._as_guest_hook(f"Bearer {token}"), "Guest")
		self.assertEqual(self._as_guest_hook(f"token {token}"), "Guest")
		self.assertEqual(self._as_guest_hook(None), "Guest")
		self.assertEqual(self._as_guest_hook("TaxMate not-a-real-token"), "Guest")
		self.assertEqual(self._as_guest_hook(f"TaxMate {token} extra"), "Guest")

	def test_hook_keeps_form_dict(self):
		token = self._code_login()["token"]
		frappe.set_user("Guest")
		with self._request(f"TaxMate {token}"):
			frappe.local.form_dict = frappe._dict(doctype="Sales Invoice")
			mobile_auth.validate()
			self.assertEqual(frappe.local.form_dict.get("doctype"), "Sales Invoice")

	def test_expired_and_revoked_tokens_rejected(self):
		token = self._code_login()["token"]
		name = frappe.db.get_value(mobile_auth.DEVICE_DOCTYPE, {"user": self.email}, "name")
		frappe.db.set_value(
			mobile_auth.DEVICE_DOCTYPE, name, "expires_on", add_to_date(now_datetime(), days=-1)
		)
		mobile_auth.forget_token_hash(mobile_auth.hash_token(token))
		self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), "Guest")

		token = self._code_login("dev-9")["token"]
		self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), self.email)
		mobile.logout()
		self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), "Guest")

	def test_disable_user_revokes_devices(self):
		token = self._code_login()["token"]
		frappe.set_user("Administrator")
		user = frappe.get_doc("User", self.email)
		user.enabled = 0
		user.save(ignore_permissions=True)
		self.assertEqual(frappe.db.count(mobile_auth.DEVICE_DOCTYPE, {"user": self.email, "revoked": 0}), 0)
		self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), "Guest")

	def test_revoke_only_own_device(self):
		token = self._code_login()["token"]
		name = frappe.db.get_value(mobile_auth.DEVICE_DOCTYPE, {"user": self.email}, "name")
		other = f"tm-mobile-other-{uuid.uuid4().hex[:8]}@example.com"
		frappe.set_user("Administrator")
		invite_user(email=other, first_name="Other", spa_role="viewer", send_welcome_email=0)
		try:
			frappe.set_user(other)
			with self.assertRaises(frappe.DoesNotExistError):
				mobile.revoke_device(name)
			self.assertEqual(mobile.my_devices()["devices"], [])
			frappe.set_user(self.email)
			self.assertEqual(len(mobile.my_devices()["devices"]), 1)
			mobile.revoke_device(name)
			self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), "Guest")
		finally:
			frappe.set_user("Administrator")
			frappe.delete_doc("User", other, force=True, ignore_permissions=True)

	# -- server-side hygiene -----------------------------------------------

	def test_change_password_wrong_current_is_417(self):
		frappe.set_user(self.email)
		with self.assertRaises(frappe.ValidationError) as ctx:
			change_password("not-my-password", "Another-Pass-77!")
		self.assertNotIsInstance(ctx.exception, frappe.AuthenticationError)
		self.assertEqual(ctx.exception.http_status_code, 417)

	def test_change_password_revokes_other_devices(self):
		"""SPA change_password keeps the calling device, revokes every other one."""
		first = self._code_login("dev-a")["token"]
		second = self._code_login("dev-b")["token"]
		keep_name = frappe.db.get_value(
			mobile_auth.DEVICE_DOCTYPE,
			{"token_hash": mobile_auth.hash_token(second), "revoked": 0},
			"name",
		)
		frappe.set_user(self.email)
		frappe.local.taxmate_device = keep_name
		try:
			change_password(PASSWORD, "Another-Pass-77!")
		finally:
			frappe.local.taxmate_device = None
		self.assertEqual(self._as_guest_hook(f"TaxMate {first}"), "Guest")
		self.assertEqual(self._as_guest_hook(f"TaxMate {second}"), self.email)
		self.assertEqual(frappe.db.count(mobile_auth.DEVICE_DOCTYPE, {"user": self.email, "revoked": 0}), 1)

	def test_reset_link_override_revokes_devices(self):
		token = self._code_login()["token"]
		frappe.set_user("Administrator")
		frappe.db.set_value(
			"User",
			self.email,
			{
				"reset_password_key": sha256_hash("tm-key"),
				"last_reset_password_key_generated_on": now_datetime(),
			},
		)
		frappe.set_user("Guest")
		with mock.patch.object(frappe.local, "login_manager", mock.MagicMock(), create=True):
			mobile_auth.update_password(new_password="Reset-Pass-881!xQ", key="tm-key")
		self.assertEqual(frappe.db.count(mobile_auth.DEVICE_DOCTYPE, {"user": self.email, "revoked": 0}), 0)
		self.assertEqual(self._as_guest_hook(f"TaxMate {token}"), "Guest")

	def test_device_cap(self):
		frappe.set_user("Guest")
		# _limit: the per-username window (10 per 15 min) would stop the 11th sign-in
		with mock.patch("taxmate.api.mobile._limit"):
			tokens = [
				mobile.login(self.email, PASSWORD, f"cap-{i}")["token"]
				for i in range(mobile.MAX_ACTIVE_DEVICES)
			]
			# make cap-0 the least recently used
			first = frappe.db.get_value(
				mobile_auth.DEVICE_DOCTYPE, {"token_hash": mobile_auth.hash_token(tokens[0])}
			)
			frappe.db.set_value(
				mobile_auth.DEVICE_DOCTYPE, first, "last_used_on", add_to_date(now_datetime(), days=-3)
			)
			mobile.login(self.email, PASSWORD, "cap-new")
		active = frappe.db.count(mobile_auth.DEVICE_DOCTYPE, {"user": self.email, "revoked": 0})
		self.assertEqual(active, mobile.MAX_ACTIVE_DEVICES)
		self.assertEqual(frappe.db.get_value(mobile_auth.DEVICE_DOCTYPE, first, "revoked"), 1)

	def test_cleanup_job(self):
		self._code_login("old")
		self._code_login("live")
		old = frappe.db.get_value(mobile_auth.DEVICE_DOCTYPE, {"user": self.email, "device_id": "old"})
		frappe.db.set_value(
			mobile_auth.DEVICE_DOCTYPE,
			old,
			{"revoked": 1, "revoked_on": add_to_date(now_datetime(), days=-31)},
		)
		mobile_auth.cleanup_devices()
		self.assertFalse(frappe.db.exists(mobile_auth.DEVICE_DOCTYPE, old))
		self.assertEqual(frappe.db.count(mobile_auth.DEVICE_DOCTYPE, {"user": self.email}), 1)

	def test_app_config_defaults(self):
		frappe.set_user("Guest")
		out = mobile.app_config()
		self.assertTrue(out["site_ok"])
		self.assertTrue(out["min_app_version"])
		self.assertEqual(set(out), {"min_app_version", "latest_app_version", "site_ok", "email_code_login"})
