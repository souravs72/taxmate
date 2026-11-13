"""Company Link custom fields for masters ERPNext does not company-tag.

Callers: install.after_migrate, validate hooks, isolation patches, company_scoped.
"""

from __future__ import annotations

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

# Strict: active company only (blank hidden).
STRICT_CUSTOM_COMPANY = frozenset({"Customer", "Supplier", "Address", "Contact"})

# Soft: active company or untagged (shared catalog during transition).
SOFT_CUSTOM_COMPANY = frozenset(
	{
		"Item",
		"Item Group",
		"Brand",
		"Price List",
		"Customer Group",
		"Supplier Group",
		"Payment Terms Template",
		"Terms and Conditions",
		"Tax Category",
		"Territory",
		"Asset Category",
		"Driver",
		"Mode of Payment",
		"Batch",
	}
)

# Optional standard company-like Link — SPA lists follow the switcher.
OPTIONAL_COMPANY_SCOPED = frozenset(
	{
		"Lead",
		"Bank Account",
		"Pricing Rule",
		"Loyalty Program",
		"Payment Request",
		"Workflow",
		"Vehicle",
		"Shipment",
	}
)

# DocTypes that get a custom_company Custom Field from TaxMate.
ENSURE_CUSTOM_COMPANY = frozenset(
	{
		"Address",
		"Contact",
		"Payment Terms Template",
		"Terms and Conditions",
		"Tax Category",
		"Territory",
		"Asset Category",
		"Driver",
		"Mode of Payment",
		"Batch",
	}
)

_INSERT_AFTER = {
	"Address": "country",
	"Contact": "company_name",
	"Payment Terms Template": "template_name",
	"Terms and Conditions": "title",
	"Tax Category": "title",
	"Territory": "territory_name",
	"Asset Category": "asset_category_name",
	"Driver": "full_name",
	"Mode of Payment": "mode_of_payment",
	"Batch": "item",
}


def _field_def(doctype: str) -> dict:
	insert_after = _INSERT_AFTER.get(doctype)
	meta = frappe.get_meta(doctype)
	if insert_after and not meta.has_field(insert_after):
		insert_after = meta.fields[0].fieldname if meta.fields else None
	return {
		"fieldname": "custom_company",
		"label": "Company",
		"fieldtype": "Link",
		"options": "Company",
		"insert_after": insert_after,
		"in_standard_filter": 1,
		"in_list_view": 0,
		"ignore_user_permissions": 1,
		"description": "Owning company for TaxMate isolation.",
	}


def ensure_company_link_fields() -> None:
	"""Create missing custom_company fields; keep ignore_user_permissions on."""
	fields: dict[str, list] = {}
	for doctype in sorted(ENSURE_CUSTOM_COMPANY):
		if not frappe.db.exists("DocType", doctype):
			continue
		meta = frappe.get_meta(doctype)
		if meta.has_field("custom_company"):
			continue
		fields[doctype] = [_field_def(doctype)]
	if fields:
		create_custom_fields(fields, update=True)

	for doctype in STRICT_CUSTOM_COMPANY | SOFT_CUSTOM_COMPANY | ENSURE_CUSTOM_COMPANY:
		cf = f"{doctype}-custom_company"
		if frappe.db.exists("Custom Field", cf) and not frappe.db.get_value(
			"Custom Field", cf, "ignore_user_permissions"
		):
			frappe.db.set_value("Custom Field", cf, "ignore_user_permissions", 1)
