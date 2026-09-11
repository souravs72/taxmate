"""Allow cancel/amend of UAE Bad Debt Relief after unique was dropped from JSON."""

from __future__ import annotations


def execute():
	from taxmate.uae_vat.setup import drop_field_unique

	drop_field_unique("UAE Bad Debt Relief", "sales_invoice")
