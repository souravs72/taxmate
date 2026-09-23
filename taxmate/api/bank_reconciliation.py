"""Bank reconciliation helpers for TaxMate SPA (Phase 14).

Returns uncleared Payment Entries and Journal Entry rows for a bank account,
and lets the SPA mark them cleared by setting clearance_date.
All reads go through has_permission; writes check write permission.
Catalogued in taxmate.api.get_catalog() as get_uncleared_transactions and mark_cleared.
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _

from taxmate.api.resource import require_login


@frappe.whitelist()
def get_uncleared_transactions(
	bank_account: str,
	from_date: str | None = None,
	to_date: str | None = None,
) -> list[dict[str, Any]]:
	"""Return uncleared Payment Entries and Journal Entries for *bank_account*."""
	require_login()
	if not frappe.has_permission("Bank Account", "read", bank_account):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	gl_account = frappe.db.get_value("Bank Account", bank_account, "account")

	results: list[dict[str, Any]] = []

	# --- Payment Entries ---
	pe_filters: list = [
		["bank_account", "=", bank_account],
		["clearance_date", "is", "not set"],
		["docstatus", "=", "1"],
	]
	if from_date:
		pe_filters.append(["posting_date", ">=", from_date])
	if to_date:
		pe_filters.append(["posting_date", "<=", to_date])

	pe_list = frappe.get_list(
		"Payment Entry",
		fields=["name", "payment_type", "party", "party_name", "posting_date", "paid_amount", "reference_no"],
		filters=pe_filters,
		limit=500,
		order_by="posting_date asc",
	)
	for pe in pe_list:
		results.append(
			{
				"doctype": "Payment Entry",
				"name": pe.name,
				"date": str(pe.posting_date) if pe.posting_date else "",
				"party": pe.get("party_name") or pe.get("party") or "",
				"amount": float(pe.paid_amount or 0),
				"reference": pe.get("reference_no") or "",
				"type": pe.payment_type or "",
			}
		)

	# --- Journal Entries via account rows ---
	if gl_account:
		je_accounts = frappe.db.get_all(
			"Journal Entry Account",
			fields=["parent"],
			filters={
				"account": gl_account,
				"clearance_date": ("is", "not set"),
				"docstatus": 1,
			},
			pluck="parent",
			limit=500,
		)
		if je_accounts:
			je_extra: list = [["name", "in", je_accounts], ["docstatus", "=", "1"]]
			if from_date:
				je_extra.append(["posting_date", ">=", from_date])
			if to_date:
				je_extra.append(["posting_date", "<=", to_date])
			je_list = frappe.get_list(
				"Journal Entry",
				fields=["name", "posting_date", "total_debit", "user_remark"],
				filters=je_extra,
				limit=500,
				order_by="posting_date asc",
			)
			for je in je_list:
				results.append(
					{
						"doctype": "Journal Entry",
						"name": je.name,
						"date": str(je.posting_date) if je.posting_date else "",
						"party": "",
						"amount": float(je.total_debit or 0),
						"reference": je.get("user_remark") or "",
						"type": "Journal Entry",
					}
				)

	results.sort(key=lambda r: r["date"])
	return results


@frappe.whitelist()
def mark_cleared(doctype: str, name: str, clearance_date: str) -> dict[str, str]:
	"""Set *clearance_date* on a Payment Entry or Journal Entry account rows."""
	require_login()
	if doctype == "Payment Entry":
		if not frappe.has_permission("Payment Entry", "write", name):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		frappe.db.set_value("Payment Entry", name, "clearance_date", clearance_date)
		frappe.db.commit()
	elif doctype == "Journal Entry":
		if not frappe.has_permission("Journal Entry", "write", name):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		frappe.db.sql(
			"UPDATE `tabJournal Entry Account` SET clearance_date = %s WHERE parent = %s",
			(clearance_date, name),
		)
		frappe.db.commit()
	else:
		frappe.throw(_("Invalid doctype for reconciliation"), frappe.ValidationError)
	return {"status": "ok", "name": name}
