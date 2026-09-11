"""Purchase Invoice hooks for UAE self-billed e-invoicing (389 / 361)."""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae_e_invoicing.utils.e_invoice import (
	enqueue_generate,
	is_e_invoice_applicable,
)
from taxmate.uae_e_invoicing.utils.purchase_transaction_data import (
	UAEPurchaseTransactionData,
)


def before_submit(doc, method=None):
	if not is_e_invoice_applicable(doc):
		return

	UAEPurchaseTransactionData(doc).validate()


def on_submit(doc, method=None):
	if not is_e_invoice_applicable(doc):
		return

	doc.db_set("uae_e_invoice_status", "Queued", update_modified=False)
	enqueue_generate(doc.name, doctype="Purchase Invoice")


def before_cancel(doc, method=None):
	"""A reported self-billed e-invoice legally exists — use a debit/credit note."""
	if not is_e_invoice_applicable(doc):
		return

	if doc.get("uae_e_invoice_status") in ("Queued", "Generated", "Submitted", "Accepted"):
		frappe.throw(
			_(
				"{0} has already been reported (or queued for reporting) to the FTA "
				"and cannot be cancelled. Issue a Return (Self-Billed Credit Note) instead."
			).format(doc.name),
			title=_("E-Invoice Reported"),
		)


def on_cancel(doc, method=None):
	if not is_e_invoice_applicable(doc):
		return

	if doc.get("uae_e_invoice_log"):
		frappe.db.set_value("UAE E-Invoice Log", doc.uae_e_invoice_log, "status", "Cancelled")
	doc.db_set("uae_e_invoice_status", "Cancelled", update_modified=False)
