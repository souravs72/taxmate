"""Purchase Order hooks for UAE VAT (place of supply & designated zone)."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae_vat.utils.place_of_supply import (
	purchase_order_zone_guidance,
	validate_purchase_order,
)


def validate(doc, method=None):
	"""Resolve the supplying Emirate, surface zone guidance."""
	validate_purchase_order(doc, on_submit=False)
	_zone_hint(doc)


def before_submit(doc, method=None):
	"""Refuse to submit a purchase order with zone violations."""
	validate_purchase_order(doc, on_submit=True)


def _zone_hint(doc):
	hint = purchase_order_zone_guidance(doc)
	if hint:
		frappe.msgprint(hint, title=_("Designated Zone"), indicator="orange", alert=True)
