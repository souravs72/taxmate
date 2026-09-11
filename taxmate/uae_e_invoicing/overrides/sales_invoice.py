"""Sales Invoice hooks for UAE e-invoicing."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae_e_invoicing.utils.e_invoice import (
	enqueue_generate,
	is_e_invoice_applicable,
)
from taxmate.uae_e_invoicing.utils.transaction_data import UAETransactionData


def validate(doc, method=None):
	if not is_e_invoice_applicable(doc):
		return

	_validate_items(doc)


def before_submit(doc, method=None):
	"""Block submission until the invoice satisfies PINT-AE business rules."""
	if not is_e_invoice_applicable(doc):
		return

	UAETransactionData(doc).validate()


def on_submit(doc, method=None):
	if not is_e_invoice_applicable(doc):
		return

	doc.db_set("uae_e_invoice_status", "Queued", update_modified=False)
	enqueue_generate(doc.name)


def before_cancel(doc, method=None):
	"""A reported e-invoice legally exists — corrections require a Credit Note."""
	if not is_e_invoice_applicable(doc):
		return

	# Queued/Generated: ASP job may still run; Submitted/Accepted: legal e-invoice exists
	if doc.get("uae_e_invoice_status") in ("Queued", "Generated", "Submitted", "Accepted"):
		frappe.throw(
			_(
				"{0} has already been reported (or queued for reporting) to the FTA "
				"and cannot be cancelled. Issue a Credit Note (Return) instead."
			).format(doc.name),
			title=_("E-Invoice Reported"),
		)


def on_cancel(doc, method=None):
	if not is_e_invoice_applicable(doc):
		return

	if doc.get("uae_e_invoice_log"):
		frappe.db.set_value("UAE E-Invoice Log", doc.uae_e_invoice_log, "status", "Cancelled")
	doc.db_set("uae_e_invoice_status", "Cancelled", update_modified=False)


def _validate_items(doc):
	"""Early, row-level feedback while the user is still drafting."""
	from taxmate.uae_e_invoicing.constants import (
		ITEM_TYPE_BOTH,
		ITEM_TYPE_GOODS,
		ITEM_TYPE_SERVICE,
	)

	for row in doc.items or []:
		item_type = row.get("uae_item_type")
		if item_type in (ITEM_TYPE_GOODS, ITEM_TYPE_BOTH) and not row.get("hs_code"):
			frappe.throw(
				_("Row #{0}: HS Code is required for {1} when UAE e-invoicing is enabled.").format(
					row.idx, item_type
				)
			)
		if item_type in (ITEM_TYPE_SERVICE, ITEM_TYPE_BOTH) and not row.get("sac_code"):
			frappe.throw(
				_("Row #{0}: SAC Code is required for {1} when UAE e-invoicing is enabled.").format(
					row.idx, item_type
				)
			)
