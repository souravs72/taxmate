"""Give each non-admin user a Company User Permission from their default company.

Called once from taxmate/patches.txt on bench migrate. User Permission fields:
user, allow="Company", for_value=<company name>, is_default=1.
Administrator and System Manager are skipped.
"""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.exists("DocType", "User Permission"):
		return
	from frappe.permissions import add_user_permission

	users = frappe.get_all(
		"User",
		filters={"name": ["not in", ["Guest", "Administrator"]]},
		pluck="name",
	)
	for user in users:
		if "System Manager" in frappe.get_roles(user):
			continue
		if frappe.db.exists("User Permission", {"user": user, "allow": "Company"}):
			continue
		# This user's own default only. get_user_default also returns the
		# site-wide default, which would map every user to that company.
		own = frappe.defaults.get_defaults_for(user)
		company = own.get("taxmate_active_company") or own.get("company")
		if isinstance(company, list | tuple):
			company = company[0] if company else None
		if not company or not frappe.db.exists("Company", company):
			continue
		add_user_permission("Company", company, user, ignore_permissions=True, is_default=1)
