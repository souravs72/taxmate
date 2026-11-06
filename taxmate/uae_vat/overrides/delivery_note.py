"""Delivery Note hooks for UAE VAT (place of supply & designated zone)."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae_vat.utils.place_of_supply import (
	sales_order_zone_guidance,
	validate_delivery_note,
)


def validate(doc, method=None):
	"""Resolve the Emirate, warn if missing, surface zone guidance."""
	validate_delivery_note(doc, on_submit=False)
	_zone_hint(doc)


def before_submit(doc, method=None):
	"""Refuse to submit a delivery note with place of supply or zone violations."""
	validate_delivery_note(doc, on_submit=True)


def _zone_hint(doc):
	hint = sales_order_zone_guidance(doc)
	if hint:
		frappe.msgprint(hint, title=_("Designated Zone"), indicator="orange", alert=True)
