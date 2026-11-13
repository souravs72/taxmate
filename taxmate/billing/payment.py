"""Activate company subscription after SaaS Sales Invoice is paid."""

from __future__ import annotations

import frappe
from frappe.utils import add_days, add_months, add_years, getdate, today

from taxmate.billing.constants import (
	CYCLE_ANNUAL,
	CYCLE_MONTHLY,
	SI_COMPANY_FIELD,
	SI_CYCLE_FIELD,
	SI_PLAN_FIELD,
	STATUS_ACTIVE,
	SUBSCRIPTION_DOCTYPE,
)


def period_end_for(cycle: str, start=None):
	start = getdate(start or today())
	if cycle == CYCLE_ANNUAL:
		return add_years(start, 1)
	return add_months(start, 1)


def activate_subscription(
	company: str,
	plan: str,
	billing_cycle: str,
	*,
	sales_invoice: str | None = None,
	payment_request: str | None = None,
) -> str:
	"""Mark company subscription Active for one billing period. Idempotent within period."""
	if not company or not plan or billing_cycle not in (CYCLE_MONTHLY, CYCLE_ANNUAL):
		frappe.throw(frappe._("Invalid subscription activation"))

	name = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, {"company": company}, "name")
	if not name:
		from taxmate.billing.trial import ensure_company_trial

		name = ensure_company_trial(company)
	if not name:
		frappe.throw(frappe._("No subscription for company {0}").format(company))

	start = getdate(today())
	end = period_end_for(billing_cycle, start)
	existing_end = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, name, "current_period_end")
	existing_status = frappe.db.get_value(SUBSCRIPTION_DOCTYPE, name, "status")
	# Idempotent: same SI already linked
	if sales_invoice and frappe.db.get_value(SUBSCRIPTION_DOCTYPE, name, "last_sales_invoice") == sales_invoice:
		return name
	# Already active covering today with same plan/cycle — extend from current end if renewing same invoice not set
	values = {
		"status": STATUS_ACTIVE,
		"plan": plan,
		"billing_cycle": billing_cycle,
		"current_period_start": start,
		"current_period_end": end,
	}
	if existing_status == STATUS_ACTIVE and existing_end and getdate(existing_end) >= start:
		# Renewal while still active: extend from existing end
		values["current_period_start"] = getdate(existing_end)
		values["current_period_end"] = period_end_for(billing_cycle, getdate(existing_end))
	if sales_invoice:
		values["last_sales_invoice"] = sales_invoice
	if payment_request:
		values["last_payment_request"] = payment_request
	frappe.db.set_value(SUBSCRIPTION_DOCTYPE, name, values)
	return name


def on_payment_entry_submit(doc, method=None):
	"""Payment Entry.on_submit — activate when PE clears a TaxMate SaaS invoice."""
	if doc.docstatus != 1:
		return
	for ref in doc.get("references") or []:
		if ref.reference_doctype != "Sales Invoice" or not ref.reference_name:
			continue
		si = frappe.db.get_value(
			"Sales Invoice",
			ref.reference_name,
			[SI_COMPANY_FIELD, SI_PLAN_FIELD, SI_CYCLE_FIELD, "status"],
			as_dict=True,
		)
		if not si or not si.get(SI_COMPANY_FIELD) or not si.get(SI_PLAN_FIELD):
			continue
		if si.status not in ("Paid", "Partly Paid"):
			# PE just submitted — status may update after; still activate when amount allocated
			pass
		pr = frappe.db.get_value(
			"Payment Request",
			{"reference_doctype": "Sales Invoice", "reference_name": ref.reference_name, "docstatus": 1},
			"name",
		)
		activate_subscription(
			si.get(SI_COMPANY_FIELD),
			si.get(SI_PLAN_FIELD),
			si.get(SI_CYCLE_FIELD) or CYCLE_ANNUAL,
			sales_invoice=ref.reference_name,
			payment_request=pr,
		)
