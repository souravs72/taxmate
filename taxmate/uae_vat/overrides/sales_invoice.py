"""Sales Invoice hooks for UAE VAT (place of supply, credit notes)."""

from __future__ import annotations

from taxmate.uae_vat.utils.period_lock import validate_period_lock
from taxmate.uae_vat.utils.place_of_supply import validate_sales_invoice


def validate(doc, method=None):
	validate_sales_invoice(doc)
	validate_period_lock(doc)


def before_cancel(doc, method=None):
	validate_period_lock(doc)
