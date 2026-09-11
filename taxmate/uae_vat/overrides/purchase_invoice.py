"""Purchase Invoice hooks for UAE VAT 201 Box 9 and credit notes.

Called from hooks.py Purchase Invoice.validate.
"""

from __future__ import annotations

from taxmate.uae_vat.utils.place_of_supply import validate_purchase_invoice
from taxmate.uae_vat.utils.recoverability import apply_box_9_recoverable


def validate(doc, method=None):
	apply_box_9_recoverable(doc)
	validate_purchase_invoice(doc)


def default_recoverable_standard_rated_expenses(doc) -> None:
	"""Back-compat alias — Box 9 is applied in ``validate``."""
	apply_box_9_recoverable(doc)
