"""Scheduled retry of failed UAE e-invoice submissions."""

from __future__ import annotations

import frappe

MAX_RETRIES = 5
BATCH_SIZE = 25

# ASP already has the document — sync locally; do not re-POST
SKIP_RESUBMIT_STATUSES = {"Accepted", "Submitted", "Rejected", "Queued", "Generated"}


def retry_failed_e_invoices():
	"""Poll ASP first; only resubmit Failed logs that are truly missing remotely.

	On resubmit, ``generate_and_submit`` reuses the existing log UUID so the
	ASP does not create a duplicate fiscal document.
	"""
	if not frappe.db.exists("DocType", "UAE E-Invoice Log"):
		return

	from taxmate.uae_e_invoicing.utils.e_invoice import (
		generate_and_submit,
		is_e_invoice_applicable,
		sync_status_from_asp,
	)

	pending = frappe.get_all(
		"UAE E-Invoice Log",
		filters={
			"status": "Failed",
			"retry_count": ("<", MAX_RETRIES),
		},
		fields=[
			"name",
			"reference_doctype",
			"reference_name",
			"retry_count",
			"asp_document_id",
			"uuid",
		],
		order_by="modified asc",
		limit=BATCH_SIZE,
	)

	for row in pending:
		if not frappe.db.exists(row.reference_doctype, row.reference_name):
			continue

		doc = frappe.get_doc(row.reference_doctype, row.reference_name)
		if doc.docstatus != 1 or not is_e_invoice_applicable(doc):
			continue

		# Prefer status sync over blind re-POST when ASP already has an ID
		if row.asp_document_id:
			mapped = sync_status_from_asp(row.name)
			if mapped and mapped in SKIP_RESUBMIT_STATUSES:
				# Commit per row so one failure does not roll back the batch
				frappe.db.commit()  # nosemgrep
				continue

		frappe.db.set_value(
			"UAE E-Invoice Log",
			row.name,
			"retry_count",
			(row.retry_count or 0) + 1,
			update_modified=False,
		)

		try:
			generate_and_submit(doc)
			# Commit per row so one failure does not roll back the batch
			frappe.db.commit()  # nosemgrep
		except Exception:
			frappe.db.rollback()
			frappe.log_error(
				title=f"UAE e-invoice retry failed for {row.reference_name}",
				message=frappe.get_traceback(),
			)
