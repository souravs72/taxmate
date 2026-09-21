"""Four TaxMate SPA roles, each a bundle of Frappe / ERPNext roles.

Importers: taxmate.install.after_install, taxmate.api.users, taxmate.api.get_session.
No existing spa_roles.py (Glob empty; no TaxMate Owner string in the tree).
Schema: spa_role owner|accountant|clerk|viewer; marker Role.role_name; User.roles child.
User: "Keep users and roles simplified - an accounts business may not need every
role. So backend could use a combination of role permissions for a frontend
role. And we could have 3 or 4 roles in the frontend for the users."
"""

from __future__ import annotations

import frappe
from frappe.permissions import add_permission, update_permission_property

SPA_ROLES: tuple[str, ...] = ("owner", "accountant", "clerk", "viewer")

MARKER: dict[str, str] = {
	"owner": "TaxMate Owner",
	"accountant": "TaxMate Accountant",
	"clerk": "TaxMate Clerk",
	"viewer": "TaxMate Viewer",
}

# Never assign System Manager from the SPA.
BUNDLE: dict[str, tuple[str, ...]] = {
	"owner": (
		"TaxMate Owner",
		"Accounts Manager",
		"UAE Tax Manager",
		"Accounts User",
		"Sales Manager",
		"Purchase Manager",
	),
	"accountant": (
		"TaxMate Accountant",
		"Accounts Manager",
		"Accounts User",
		"UAE Tax Manager",
		"Sales User",
		"Purchase User",
	),
	"clerk": (
		"TaxMate Clerk",
		"Accounts User",
		"Sales User",
		"Purchase User",
	),
	"viewer": ("TaxMate Viewer",),
}

MANAGED_ROLES: frozenset[str] = frozenset(role for bundle in BUNDLE.values() for role in bundle)

VIEWER_READ_DOCTYPES: tuple[str, ...] = (
	"Sales Invoice",
	"Sales Order",
	"Delivery Note",
	"Purchase Invoice",
	"Purchase Order",
	"Purchase Receipt",
	"Payment Entry",
	"Journal Entry",
	"Account",
	"Customer",
	"Supplier",
	"Item",
	"Warehouse",
	"Sales Taxes and Charges Template",
	"Purchase Taxes and Charges Template",
	"UAE E-Invoice Log",
	"UAE VAT 201 Filing Log",
	"UAE CT Filing Log",
	"UAE ESR Filing",
	"UAE UBO Register",
	"UAE Late Filing Notice",
	"UAE Incoming Invoice",
	"UAE Tax Settings",
	"Address",
	"Contact",
	"Mode of Payment",
	"Company",
	"GL Entry",
)


def ensure_spa_roles() -> None:
	"""Create marker roles and Viewer read perms. Idempotent."""
	for spa, name in MARKER.items():
		if frappe.db.exists("Role", name):
			continue
		frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": name,
				"desk_access": 0 if spa in ("clerk", "viewer") else 1,
			}
		).insert(ignore_permissions=True)

	viewer = MARKER["viewer"]
	if not frappe.db.exists("Role", viewer):
		return
	for doctype in VIEWER_READ_DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		try:
			add_permission(doctype, viewer, 0)
		except Exception:
			pass
		for perm in ("read", "print", "report", "export", "share"):
			try:
				update_permission_property(doctype, viewer, 0, perm, 1)
			except Exception:
				pass
		for perm in ("write", "create", "submit", "cancel", "amend", "delete"):
			try:
				update_permission_property(doctype, viewer, 0, perm, 0)
			except Exception:
				pass


def spa_role_of(user: str | None = None) -> str:
	"""Map Frappe roles onto one SPA role. System Manager is always Owner."""
	user = user or frappe.session.user
	roles = set(frappe.get_roles(user))
	if "System Manager" in roles or MARKER["owner"] in roles:
		return "owner"
	if MARKER["accountant"] in roles:
		return "accountant"
	if MARKER["clerk"] in roles:
		return "clerk"
	if MARKER["viewer"] in roles:
		return "viewer"
	if "Accounts Manager" in roles or "UAE Tax Manager" in roles:
		return "accountant"
	if "Accounts User" in roles:
		return "clerk"
	return "viewer"


def apply_spa_role(user: str, spa_role: str) -> None:
	if spa_role not in SPA_ROLES:
		frappe.throw(frappe._("Unknown role"))
	if user in ("Administrator", "Guest"):
		frappe.throw(frappe._("That user cannot be changed from TaxMate"))

	doc = frappe.get_doc("User", user)
	keep = [
		row.role
		for row in doc.roles
		if row.role not in MANAGED_ROLES and row.role != "System Manager"
	]
	doc.set("roles", [])
	for role in (*keep, *BUNDLE[spa_role]):
		if role and frappe.db.exists("Role", role):
			doc.append("roles", {"role": role})
	doc.save(ignore_permissions=True)
	frappe.clear_cache(user=user)
