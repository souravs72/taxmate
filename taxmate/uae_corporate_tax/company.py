"""Company doc-event handlers for the UAE Corporate Tax module."""

from __future__ import annotations

import frappe

from taxmate.uae_corporate_tax.setup import ensure_company_ct_settings


def after_insert(doc, method=None):
	try:
		ensure_company_ct_settings(doc.name)
	except Exception:
		frappe.log_error(
			title="TaxMate UAE Corporate Tax company bootstrap failed",
			message=frappe.get_traceback(),
		)
