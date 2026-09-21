"""SPA team admin tests: invite then set role. User stays off catalog.

Importers/callers: bench run-tests --module taxmate.tests.test_spa_users.
API: taxmate.api.users.invite_user / set_user_role / list_users / get_session.spa_role.
Schema: User name=email, spa_role owner|accountant|clerk|viewer, enabled 0|1.
User: "Keep users and roles simplified … 3 or 4 roles in the frontend for
the users. Please follow the same automated implementation … and commit."
"""

from __future__ import annotations

import uuid

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.api import get_catalog, get_session
from taxmate.api.resource import is_allowed_doctype
from taxmate.api.users import invite_user, list_users, set_user_enabled, set_user_role
from taxmate.setup.spa_roles import ensure_spa_roles, spa_role_of


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

	def test_invite_then_set_role(self):
		created = self._invite("clerk")
		try:
			self.assertEqual(created["spa_role"], "clerk")
			self.assertEqual(spa_role_of(created["name"]), "clerk")
			roles = frappe.get_roles(created["name"])
			self.assertNotIn("System Manager", roles)
			self.assertIn("TaxMate Clerk", roles)
			updated = set_user_role(user=created["name"], spa_role="accountant")
			self.assertEqual(updated["spa_role"], "accountant")
			self.assertEqual(spa_role_of(created["name"]), "accountant")
			disabled = set_user_enabled(user=created["name"], enabled=0)
			self.assertEqual(disabled["enabled"], 0)
			names = {row["name"] for row in list_users()}
			self.assertIn(created["name"], names)
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
