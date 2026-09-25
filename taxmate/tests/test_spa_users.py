"""SPA team admin tests: invite then set role. User stays off catalog.

Run: bench --site taxmate.site run-tests --module taxmate.tests.test_spa_users
"""

from __future__ import annotations

import uuid

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import cint

from taxmate.api import get_catalog, get_session
from taxmate.api.resource import is_allowed_doctype
from taxmate.api.users import (
	change_password,
	get_profile,
	invite_user,
	list_users,
	set_user_enabled,
	set_user_role,
	update_profile,
)
from taxmate.setup.spa_roles import MARKER, ensure_spa_roles, spa_role_of


class TestSpaUsers(FrappeTestCase):
	def setUp(self):
		ensure_spa_roles()

	def _invite(self, spa_role: str = "clerk") -> dict:
		email = f"tm-{spa_role}-{uuid.uuid4().hex[:8]}@example.com"
		return invite_user(
			email=email,
			first_name="TaxMate",
			last_name=spa_role.title(),
			spa_role=spa_role,
			send_welcome_email=0,
		)

	def _delete(self, name: str) -> None:
		if name and frappe.db.exists("User", name):
			frappe.delete_doc("User", name, force=True, ignore_permissions=True)

	def test_session_returns_spa_role(self):
		session = get_session()
		self.assertIn(session["spa_role"], ("owner", "accountant", "clerk", "viewer"))
		self.assertEqual(session["spa_role"], "owner")

	def test_catalog_exposes_user_actions_not_user_resource(self):
		catalog = get_catalog()
		doctypes = {row["doctype"] for row in catalog["resources"]}
		self.assertNotIn("User", doctypes)
		self.assertFalse(is_allowed_doctype("User"))
		methods = {row["method"] for row in catalog["actions"]}
		self.assertIn("taxmate.api.users.list_users", methods)
		self.assertIn("taxmate.api.users.invite_user", methods)
		self.assertIn("taxmate.api.users.set_user_role", methods)
		self.assertIn("taxmate.api.users.set_user_enabled", methods)
		self.assertIn("taxmate.api.users.get_profile", methods)
		self.assertIn("taxmate.api.users.update_profile", methods)
		self.assertIn("taxmate.api.users.change_password", methods)

	def test_invite_then_set_role(self):
		created = self._invite("clerk")
		try:
			self.assertEqual(created["spa_role"], "clerk")
			self.assertEqual(spa_role_of(created["name"]), "clerk")
			roles = frappe.get_roles(created["name"])
			self.assertNotIn("System Manager", roles)
			self.assertIn("TaxMate Accounts Officer", roles)
			self.assertNotIn("Accounts User", roles)
			self.assertNotIn("Accounts Manager", roles)
			user = frappe.get_doc("User", created["name"])
			self.assertFalse(user.has_desk_access())
			self.assertEqual(user.redirect_url, "/taxmate")
			updated = set_user_role(user=created["name"], spa_role="accountant")
			self.assertEqual(updated["spa_role"], "accountant")
			self.assertEqual(spa_role_of(created["name"]), "accountant")
			self.assertFalse(frappe.get_doc("User", created["name"]).has_desk_access())
			disabled = set_user_enabled(user=created["name"], enabled=0)
			self.assertEqual(disabled["enabled"], 0)
			names = {row["name"] for row in list_users()}
			self.assertIn(created["name"], names)
		finally:
			self._delete(created["name"])


	def test_multi_spa_roles_union(self):
		"""Multiple TaxMate markers are stored; Frappe unions DocPerms (highest wins UI)."""
		from taxmate.setup.spa_roles import MARKER, apply_spa_roles, spa_roles_of

		email = f"tm-multi-{uuid.uuid4().hex[:8]}@example.com"
		created = invite_user(
			email=email,
			first_name="Multi",
			spa_roles=["clerk", "viewer"],
			send_welcome_email=0,
		)
		try:
			self.assertEqual(set(created["spa_roles"]), {"clerk", "viewer"})
			self.assertEqual(created["spa_role"], "clerk")
			roles = set(frappe.get_roles(created["name"]))
			self.assertIn(MARKER["clerk"], roles)
			self.assertIn(MARKER["viewer"], roles)
			updated = set_user_role(
				user=created["name"],
				spa_roles=["accountant", "clerk"],
			)
			self.assertEqual(set(updated["spa_roles"]), {"accountant", "clerk"})
			self.assertEqual(updated["spa_role"], "accountant")
			self.assertEqual(set(spa_roles_of(created["name"])), {"accountant", "clerk"})
			# Union: accountant cancel + clerk create both present via DocPerms
			frappe.set_user(created["name"])
			self.assertTrue(frappe.has_permission("Sales Invoice", "create"))
			self.assertTrue(frappe.has_permission("Sales Invoice", "cancel"))
		finally:
			frappe.set_user("Administrator")
			self._delete(created["name"])

	def test_spa_roles_have_no_desk_administrator_does(self):
		ensure_spa_roles()
		for name in MARKER.values():
			self.assertEqual(cint(frappe.db.get_value("Role", name, "desk_access")), 0)
		self.assertTrue(frappe.get_doc("User", "Administrator").has_desk_access())

	def test_invite_stores_mobile_and_last_name(self):
		email = f"tm-full-{uuid.uuid4().hex[:8]}@example.com"
		created = invite_user(
			email=email,
			first_name="Mariam",
			last_name="Hassan",
			mobile_no="+971500000001",
			spa_role="viewer",
			send_welcome_email=0,
		)
		try:
			self.assertEqual(created["last_name"], "Hassan")
			self.assertEqual(created["mobile_no"], "+971500000001")
			self.assertEqual(created["spa_role"], "viewer")
			self.assertFalse(frappe.get_doc("User", created["name"]).has_desk_access())
		finally:
			self._delete(created["name"])

	def test_cannot_change_system_manager(self):
		from frappe.utils import random_string

		email = f"tm-sm-{uuid.uuid4().hex[:8]}@example.com"
		user = frappe.new_doc("User")
		user.email = email
		user.first_name = "Sys"
		user.user_type = "System User"
		user.send_welcome_email = 0
		user.new_password = random_string(16)
		user.flags.no_welcome_mail = True
		user.insert(ignore_permissions=True)
		user.append("roles", {"role": "System Manager"})
		user.save(ignore_permissions=True)
		try:
			with self.assertRaises(frappe.PermissionError):
				set_user_role(user=user.name, spa_role="clerk")
			with self.assertRaises(frappe.PermissionError):
				set_user_enabled(user=user.name, enabled=0)
			names = {row["name"] for row in list_users()}
			self.assertNotIn(user.name, names)
		finally:
			self._delete(user.name)

	def test_accountant_cannot_invite(self):
		accountant = self._invite("accountant")
		try:
			frappe.set_user(accountant["name"])
			with self.assertRaises(frappe.PermissionError):
				invite_user(
					email=f"tm-blocked-{uuid.uuid4().hex[:8]}@example.com",
					first_name="Blocked",
					spa_role="clerk",
					send_welcome_email=0,
				)
			list_users()
		finally:
			frappe.set_user("Administrator")
			self._delete(accountant["name"])

	def test_clerk_cannot_cancel(self):
		from taxmate.api.workflow import cancel, submit

		clerk = self._invite("clerk")
		try:
			frappe.set_user(clerk["name"])
			with self.assertRaises(frappe.PermissionError):
				cancel("Journal Entry", "JE-DOES-NOT-EXIST")
			with self.assertRaises(frappe.PermissionError):
				set_user_role(user=clerk["name"], spa_role="viewer")
		finally:
			frappe.set_user("Administrator")
			self._delete(clerk["name"])

		viewer = self._invite("viewer")
		try:
			frappe.set_user(viewer["name"])
			with self.assertRaises(frappe.PermissionError):
				submit({"doctype": "Journal Entry", "name": "JE-DOES-NOT-EXIST"})
		finally:
			frappe.set_user("Administrator")
			self._delete(viewer["name"])

	def test_clerk_cannot_invite(self):
		clerk = self._invite("clerk")
		try:
			frappe.set_user(clerk["name"])
			with self.assertRaises(frappe.PermissionError):
				invite_user(
					email=f"tm-blocked-{uuid.uuid4().hex[:8]}@example.com",
					first_name="Blocked",
					spa_role="viewer",
					send_welcome_email=0,
				)
			with self.assertRaises(frappe.PermissionError):
				list_users()
		finally:
			frappe.set_user("Administrator")
			self._delete(clerk["name"])

	def test_update_own_profile(self):
		created = self._invite("clerk")
		try:
			frappe.set_user(created["name"])
			row = get_profile()
			self.assertEqual(row["email"], created["name"])
			updated = update_profile(
				first_name="Noura",
				last_name="Ali",
				mobile_no="+971501111111",
			)
			self.assertEqual(updated["first_name"], "Noura")
			self.assertEqual(updated["last_name"], "Ali")
			self.assertEqual(updated["mobile_no"], "+971501111111")
		finally:
			frappe.set_user("Administrator")
			self._delete(created["name"])

	def test_invited_clerk_can_read_books(self):
		"""Invited clerk can read Sales Invoice / Journal Entry."""
		clerk = self._invite("clerk")
		viewer = self._invite("viewer")
		try:
			frappe.set_user(clerk["name"])
			self.assertTrue(is_allowed_doctype("Sales Invoice"))
			self.assertTrue(frappe.has_permission("Sales Invoice", "read"))
			self.assertTrue(frappe.has_permission("Sales Invoice", "create"))
			self.assertTrue(frappe.has_permission("Journal Entry", "submit"))
			frappe.set_user(viewer["name"])
			self.assertTrue(frappe.has_permission("Sales Invoice", "read"))
			self.assertFalse(frappe.has_permission("Sales Invoice", "write"))
			self.assertFalse(frappe.has_permission("Sales Invoice", "create"))
		finally:
			frappe.set_user("Administrator")
			self._delete(clerk["name"])
			self._delete(viewer["name"])

	def test_change_password_rejects_wrong_current(self):
		created = self._invite("viewer")
		from frappe.utils.password import update_password

		update_password(created["name"], "TaxMate-Old-Pass1!")
		try:
			frappe.set_user(created["name"])
			with self.assertRaises(frappe.AuthenticationError):
				change_password(old_password="wrong", new_password="TaxMate-New-Pass1!")
			change_password(old_password="TaxMate-Old-Pass1!", new_password="TaxMate-New-Pass1!")
		finally:
			frappe.set_user("Administrator")
			self._delete(created["name"])
