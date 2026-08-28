"""Align UAE document type codes with the FTA code list.

Earlier builds used 388 (generic tax invoice) with a hard default; the
UAE mandate uses 380/381/480/81 for sales and 389/361 for self-billed
documents, derived automatically when left blank.
"""

import frappe


def execute():
	for doctype in ("Sales Invoice", "Purchase Invoice"):
		field_name = frappe.db.get_value(
			"Custom Field", {"dt": doctype, "fieldname": "uae_document_type_code"}, "name"
		)
		if field_name:
			frappe.db.set_value("Custom Field", field_name, "default", None)

		if not frappe.db.has_column(doctype, "uae_document_type_code"):
			continue

		# Legacy 388 => 380; retired codes 383/386 => blank (auto-derive)
		frappe.db.set_value(
			doctype,
			{"uae_document_type_code": "388"},
			"uae_document_type_code",
			"380",
			update_modified=False,
		)
		frappe.db.set_value(
			doctype,
			{"uae_document_type_code": ("in", ("383", "386"))},
			"uae_document_type_code",
			"",
			update_modified=False,
		)

	frappe.clear_cache(doctype="Sales Invoice")
	frappe.clear_cache(doctype="Purchase Invoice")
