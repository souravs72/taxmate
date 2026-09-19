"""Set e-invoice SLA clocks from the invoice posting date, not generate time."""

from __future__ import annotations

import frappe


def execute():
	if not frappe.db.exists("DocType", "UAE E-Invoice Log"):
		return
	if not frappe.db.has_column("UAE E-Invoice Log", "issued_on"):
		return

	from taxmate.uae_e_invoicing.utils.mandate import get_sla_days

	days = get_sla_days()
	frappe.db.sql(
		"""
		update `tabUAE E-Invoice Log` log
		left join `tabSales Invoice` si
			on log.reference_doctype = 'Sales Invoice' and log.reference_name = si.name
		left join `tabPurchase Invoice` pi
			on log.reference_doctype = 'Purchase Invoice' and log.reference_name = pi.name
		set
			log.issued_on = coalesce(si.posting_date, pi.posting_date, log.issued_on, log.creation),
			log.sla_due = date_add(
				date(coalesce(si.posting_date, pi.posting_date, log.issued_on, log.creation)),
				interval %s day
			)
		""",
		(days,),
	)
