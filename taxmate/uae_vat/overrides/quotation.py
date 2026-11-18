"""Quotation hooks for UAE VAT (place of supply)."""

from __future__ import annotations

from taxmate.uae_vat.utils.place_of_supply import stamp_vat_emirate, validate_quotation


def before_validate(doc, method=None):
	"""Stamp vat_emirate before Frappe's mandatory check."""
	stamp_vat_emirate(doc)


def validate(doc, method=None):
	"""Resolve the supplying Emirate so it carries through to Sales Order and Invoice."""
	validate_quotation(doc)
