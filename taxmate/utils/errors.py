"""Consistent API / validation errors for TaxMate."""

from __future__ import annotations

import frappe


def api_error(message, status_code: int = 400, exc=None):
	frappe.local.response["http_status_code"] = status_code
	frappe.throw(message, exc or frappe.ValidationError)
