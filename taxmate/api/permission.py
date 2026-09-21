"""App-level permission for the TaxMate website SPA and apps screen."""

from __future__ import annotations

import frappe


def has_app_permission() -> bool:
	"""True when the signed-in user may open the TaxMate SPA.

	Guests are sent to /login from ``www/taxmate.py``. This check is for
	website users and desk users who have no books access.
	"""
	if frappe.session.user in (None, "Guest"):
		return False
	roles = set(frappe.get_roles())
	if "System Manager" in roles or roles.intersection(
		{"TaxMate Owner", "TaxMate Accountant", "TaxMate Clerk", "TaxMate Viewer"}
	):
		return True
	return bool(
		frappe.has_permission("Sales Invoice", "read")
		or frappe.has_permission("Sales Order", "read")
		or frappe.has_permission("Purchase Invoice", "read")
	)
