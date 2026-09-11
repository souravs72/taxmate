"""Company doc-event handlers for the UAE Compliance module."""

from __future__ import annotations

import frappe

from taxmate.uae_compliance.setup import ensure_company_shareholder_register, ensure_company_ubo_register


def after_insert(doc, method=None):
	try:
		ensure_company_ubo_register(doc.name)
		ensure_company_shareholder_register(doc.name)
	except Exception:
		frappe.log_error(
			title="TaxMate UAE Compliance company bootstrap failed",
			message=frappe.get_traceback(),
		)
