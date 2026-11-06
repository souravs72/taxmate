"""Quotation hooks for UAE VAT (place of supply)."""

from __future__ import annotations

from taxmate.uae_vat.utils.place_of_supply import validate_quotation


def validate(doc, method=None):
	"""Resolve the supplying Emirate so it carries through to Sales Order and Invoice."""
	validate_quotation(doc)
