"""Desk routes stay with Administrator. Other accounts go to the SPA."""

from __future__ import annotations

import unittest

from taxmate.setup.desk_gate import desk_redirect_for, is_desk_route


class TestDeskGate(unittest.TestCase):
	def test_desk_app_and_apps_are_desk_routes(self) -> None:
		for path in ("/desk", "/desk/", "/desk/sales-invoice", "/app", "/app/user", "/apps", "/apps/"):
			self.assertTrue(is_desk_route(path), path)

	def test_spa_api_and_lookalikes_stay_open(self) -> None:
		for path in (
			"/taxmate",
			"/taxmate/invoices",
			"/api/method/taxmate.api.get_catalog",
			"/assets/taxmate/logo.svg",
			"/login",
			"/application",
			"/apple",
		):
			self.assertFalse(is_desk_route(path), path)

	def test_only_administrator_may_open_desk(self) -> None:
		self.assertIsNone(desk_redirect_for("Administrator", "/desk/workspace"))
		self.assertIsNone(desk_redirect_for("Administrator", "/app"))
		self.assertEqual(desk_redirect_for("Guest", "/apps"), "/login?redirect-to=/taxmate")
		self.assertEqual(desk_redirect_for("owner@example.com", "/desk"), "/taxmate")
		self.assertIsNone(desk_redirect_for("owner@example.com", "/taxmate"))
