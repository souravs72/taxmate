"""Supplier Quotation hooks for UAE VAT (place of supply)."""

from __future__ import annotations

from taxmate.uae_vat.utils.place_of_supply import stamp_vat_emirate


def before_validate(doc, method=None):
	"""Stamp vat_emirate before Frappe's mandatory check.

	TaxMate's Custom Field is reqd. Unlike Quotation / Purchase Order, this
	doctype had no validate hook, so Desk / mapper insert failed when the
	company address emirate had not been fetched yet.
	"""
	stamp_vat_emirate(doc)
