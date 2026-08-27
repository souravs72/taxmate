"""Company document event handlers for UAE tenants."""

from __future__ import annotations

import frappe

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae.setup import ensure_company_uae_ready
from taxmate.uae.validation import validate_company_trn


def after_insert(doc, method=None):
	_handle_company(doc)


def on_update(doc, method=None):
	_handle_company(doc)


def validate(doc, method=None):
	validate_company_trn(doc, method)


def _handle_company(doc):
	if doc.country != UAE_COUNTRY:
		return
	try:
		ensure_company_uae_ready(doc.name)
	except Exception:
		frappe.log_error(
			title="TaxMate UAE company readiness failed",
			message=frappe.get_traceback(),
		)
