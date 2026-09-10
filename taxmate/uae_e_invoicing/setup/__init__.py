"""UAE E-Invoicing setup — Mode of Payment means codes (UNCL 4461)."""


from __future__ import annotations

import frappe

# Mode of Payment name → UNCL 4461 select option used on invoices (IBT-081)
_MODE_OF_PAYMENT_MEANS = {
	"Cash": "10 - Cash",
	"Cheque": "20 - Cheque",
	"Wire Transfer": "30 - Credit transfer",
	"Credit Card": "54 - Credit card",
	"Bank Draft": "42 - Payment to bank account",
}


def setup():
	"""Idempotent e-invoicing fixtures."""
	ensure_mode_of_payment_means_codes()


def ensure_mode_of_payment_means_codes() -> int:
	"""Set TaxMate ``uae_payment_means_code`` on standard Modes of Payment.

	Returns the number of Mode of Payment rows updated.
	"""
	if not frappe.db.has_column("Mode of Payment", "uae_payment_means_code"):
		return 0

	updated = 0
	for name, code in _MODE_OF_PAYMENT_MEANS.items():
		if not frappe.db.exists("Mode of Payment", name):
			continue
		current = frappe.db.get_value("Mode of Payment", name, "uae_payment_means_code")
		if current == code:
			continue
		frappe.db.set_value("Mode of Payment", name, "uae_payment_means_code", code)
		updated += 1
	return updated
