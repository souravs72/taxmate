"""Sales Invoice hooks for UAE VAT (place of supply, credit notes)."""

from __future__ import annotations

from taxmate.uae_vat.utils.place_of_supply import validate_sales_invoice


def validate(doc, method=None):
	validate_sales_invoice(doc)
