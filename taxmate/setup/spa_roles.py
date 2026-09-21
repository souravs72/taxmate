"""Four TaxMate SPA roles. Marker Role.role_name only — no ERPNext Desk roles.

Importers: taxmate.install.after_install, taxmate.api.users, taxmate.api.get_session.
Schema: spa_role owner|accountant|clerk|viewer; Role.desk_access=0 on every marker.
The Frappe Administrator user keeps System Manager and Desk. SPA Admin is TaxMate Owner.
User: frontend has Admin, not Administrator; none of the four SPA roles open Desk.
"""

from __future__ import annotations

import frappe
from frappe.utils import cint

SPA_ROLES: tuple[str, ...] = ("owner", "accountant", "clerk", "viewer")

MARKER: dict[str, str] = {
	"owner": "TaxMate Owner",
	"accountant": "TaxMate Accountant",
	"clerk": "TaxMate Clerk",
	"viewer": "TaxMate Viewer",
}

# SPA bundles are marker-only. Desk ERPNext roles are listed so apply_spa_role strips them.
BUNDLE: dict[str, tuple[str, ...]] = {spa: (name,) for spa, name in MARKER.items()}

LEGACY_DESK_ROLES: frozenset[str] = frozenset(
	{
		"Accounts Manager",
		"Accounts User",
		"Sales Manager",
		"Sales User",
		"Purchase Manager",
		"Purchase User",
		"UAE Tax Manager",
	}
)

MANAGED_ROLES: frozenset[str] = frozenset((*MARKER.values(), *LEGACY_DESK_ROLES))

READ_ONLY_DOCTYPES: frozenset[str] = frozenset({"GL Entry", "Fiscal Year"})
SETTINGS_DOCTYPES: frozenset[str] = frozenset(
	{
		"Company",
		"TaxMate Settings",
		"UAE Tax Settings",
		"Accounts Settings",
		"Selling Settings",
		"Buying Settings",
		"UAE VAT Settings",
	}
)

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
	"Item Tax Template",
	"Tax Category",
	"Payment Terms Template",
	"Terms and Conditions",
	"Brand",
	"UOM",
	"Customer Group",
	"Supplier Group",
	"Item Group",
	"Territory",
	"Cost Center",
	"Bank Account",
	"Fiscal Year",
	"Currency",
	"Item Price",
	"ToDo",
	"Mode of Payment",
	"Address",
	"Contact",
	"Company",
	"GL Entry",
	"TaxMate Settings",
	"Accounts Settings",
	"Selling Settings",
	"Buying Settings",
	"UAE Tax Settings",
	"UAE E-Invoice Log",
	"UAE VAT 201 Filing Log",
	"UAE CT Filing Log",
	"UAE ESR Filing",
	"UAE UBO Register",
	"UAE Late Filing Notice",
	"UAE Incoming Invoice",
)

_PERM_FLAGS: tuple[str, ...] = (
	"select",
	"read",
	"write",
	"create",
	"submit",
	"cancel",
	"amend",
	"delete",
	"print",
	"email",
	"report",
	"export",
	"share",
)


def website_user_home_page(user: str | None = None) -> str | None:
	"""Send SPA users to /taxmate after login. Administrator / Desk users are unchanged."""
	user = user or frappe.session.user
	if not user or user in ("Guest", "Administrator"):
		return None
	roles = set(frappe.get_roles(user))
	if "System Manager" in roles:
		return None
	if roles.intersection(MARKER.values()):
		return "taxmate"
	return None


def ensure_marker_roles() -> None:
	"""Create TaxMate roles with desk_access=0. Safe on a whitelist request."""
	for name in MARKER.values():
		if frappe.db.exists("Role", name):
			if cint(frappe.db.get_value("Role", name, "desk_access")):
				frappe.db.set_value("Role", name, "desk_access", 0)
			continue
		frappe.get_doc(
			{
				"doctype": "Role",
				"role_name": name,
				"desk_access": 0,
			}
		).insert(ignore_permissions=True)


def ensure_spa_roles() -> None:
	"""Create marker roles, books DocPerms, and strip Desk roles. Call from install."""
	ensure_marker_roles()
	_ensure_books_perms()
	_allow_reports()
	_strip_desk_roles_from_spa_users()


def spa_role_of(user: str | None = None) -> str:
	"""Map Frappe roles onto one SPA role. System Manager is always Owner (Admin in the SPA)."""
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
	if "System Manager" in frappe.get_roles(user):
		frappe.throw(frappe._("System managers cannot be changed from TaxMate"), frappe.PermissionError)

	doc = frappe.get_doc("User", user)
	keep = [
		row.role
		for row in doc.roles
		if row.role not in MANAGED_ROLES and row.role != "System Manager"
	]
	wanted = (*keep, *BUNDLE[spa_role])
	current = tuple(row.role for row in doc.roles)
	needs_home = (doc.redirect_url or "") != "/taxmate" or getattr(doc, "default_app", None) != "taxmate"
	if current == wanted and not needs_home:
		return

	if current != wanted:
		doc.set("roles", [])
		for role in wanted:
			if role and frappe.db.exists("Role", role):
				doc.append("roles", {"role": role})
	doc.redirect_url = "/taxmate"
	if hasattr(doc, "default_app"):
		doc.default_app = "taxmate"
	doc.save(ignore_permissions=True)
	frappe.clear_cache(user=user)


def _catalog_names() -> list[str]:
	try:
		from taxmate.api import catalog_doctypes

		return list(catalog_doctypes())
	except Exception:
		return list(VIEWER_READ_DOCTYPES)


def _perm_values(spa: str, doctype: str) -> dict[str, int]:
	read = {
		"select": 1,
		"read": 1,
		"print": 1,
		"email": 1,
		"report": 1,
		"export": 1,
		"share": 1,
		"write": 0,
		"create": 0,
		"submit": 0,
		"cancel": 0,
		"amend": 0,
		"delete": 0,
	}
	if spa == "viewer":
		return read
	settings = doctype in SETTINGS_DOCTYPES or doctype.endswith(" Settings")
	if doctype in READ_ONLY_DOCTYPES or (settings and spa == "clerk"):
		return read
	if settings and spa in ("owner", "accountant"):
		return {**read, "write": 1}
	if spa == "clerk":
		return {**read, "write": 1, "create": 1, "submit": 1}
	return {**read, "write": 1, "create": 1, "submit": 1, "cancel": 1, "amend": 1}


def _books_perms_ready() -> bool:
	# Callers: _ensure_books_perms (install.py after_install, TestSpaUsers.setUp).
	# Schema: Custom DocPerm parent/role/permlevel + create/submit/write flags.
	# User: "Review the changes using best frappe skills and react skills and commit
	# and push. Create a pr to version-16"
	clerk = MARKER["clerk"]
	viewer = MARKER["viewer"]
	return (
		cint(
			frappe.db.get_value(
				"Custom DocPerm",
				{"parent": "Sales Invoice", "role": clerk, "permlevel": 0},
				"create",
			)
		)
		== 1
		and cint(
			frappe.db.get_value(
				"Custom DocPerm",
				{"parent": "Journal Entry", "role": clerk, "permlevel": 0},
				"submit",
			)
		)
		== 1
		and cint(
			frappe.db.get_value(
				"Custom DocPerm",
				{"parent": "Sales Invoice", "role": viewer, "permlevel": 0},
				"write",
			)
		)
		== 0
	)


def _ensure_books_perms() -> None:
	if _books_perms_ready():
		return
	from frappe.permissions import setup_custom_perms

	names = list(dict.fromkeys([*_catalog_names(), *VIEWER_READ_DOCTYPES]))
	for doctype in names:
		if not frappe.db.exists("DocType", doctype):
			continue
		try:
			if frappe.get_meta(doctype).istable:
				continue
		except Exception:
			continue
		try:
			setup_custom_perms(doctype)
		except Exception:
			frappe.log_error(title=f"TaxMate perms copy failed: {doctype}")
			continue
		for spa, role in MARKER.items():
			if not frappe.db.exists("Role", role):
				continue
			flags = _perm_values(spa, doctype)
			existing = frappe.db.get_value(
				"Custom DocPerm",
				{"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0},
			)
			try:
				if existing:
					frappe.db.set_value("Custom DocPerm", existing, flags, update_modified=False)
				else:
					frappe.get_doc(
						{
							"doctype": "Custom DocPerm",
							"parent": doctype,
							"parenttype": "DocType",
							"parentfield": "permissions",
							"role": role,
							"permlevel": 0,
							"if_owner": 0,
							**flags,
						}
					).insert(ignore_permissions=True)
			except Exception:
				frappe.log_error(title=f"TaxMate perm failed: {role} / {doctype}")
	frappe.clear_cache()


def _allow_reports() -> None:
	from taxmate.setup.financial_reports import CORE_REPORT_LINKS, TAXMATE_REPORT_LINKS

	names = [name for _, name in (*CORE_REPORT_LINKS, *TAXMATE_REPORT_LINKS)]
	for report in names:
		if not frappe.db.exists("Report", report):
			continue
		for role in MARKER.values():
			if frappe.db.exists(
				"Has Role", {"parent": report, "parenttype": "Report", "role": role}
			):
				continue
			try:
				frappe.get_doc(
					{
						"doctype": "Has Role",
						"parent": report,
						"parenttype": "Report",
						"parentfield": "roles",
						"role": role,
					}
				).insert(ignore_permissions=True)
			except Exception:
				pass


def _strip_desk_roles_from_spa_users() -> None:
	parents = {
		row.parent
		for row in frappe.get_all(
			"Has Role",
			filters={"role": ["in", list(MARKER.values())], "parenttype": "User"},
			fields=["parent"],
		)
	}
	strip = LEGACY_DESK_ROLES
	for user in parents:
		if user in ("Administrator", "Guest"):
			continue
		roles = set(frappe.get_roles(user))
		if "System Manager" in roles:
			continue
		if not (roles & strip):
			continue
		apply_spa_role(user, spa_role_of(user))
