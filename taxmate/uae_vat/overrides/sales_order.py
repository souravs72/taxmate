"""Sales Order hooks for UAE VAT (place of supply).

Sales Order previously had no ``doc_events`` at all, so an order could be
submitted with an empty Emirate and the problem only surfaced later, when the
mapped Sales Invoice refused to save. These hooks move the check to the point
where the operator still has the customer in front of them.
"""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae_vat.utils.place_of_supply import (
	sales_order_zone_guidance,
	validate_sales_order,
)


def validate(doc, method=None):
	"""Resolve the Emirate, warn if it is still missing, surface zone guidance."""
	validate_sales_order(doc, on_submit=False)
	_zone_hint(doc)


def before_submit(doc, method=None):
	"""Refuse to submit an order that cannot become a reportable invoice."""
	validate_sales_order(doc, on_submit=True)


def _zone_hint(doc):
	hint = sales_order_zone_guidance(doc)
	if hint:
		frappe.msgprint(hint, title=_("Designated Zone"), indicator="orange", alert=True)
