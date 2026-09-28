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


def _uncleared_journals(
	gl_account: str,
	from_date: str | None,
	to_date: str | None,
) -> list[dict[str, Any]]:
	"""Submitted journals that hit the bank GL account and are not yet cleared."""
	from frappe.query_builder.functions import Max, Sum

	je = frappe.qb.DocType("Journal Entry")
	jea = frappe.qb.DocType("Journal Entry Account")
	query = (
		frappe.qb.from_(jea)
		.inner_join(je)
		.on(jea.parent == je.name)
		.select(
			je.name,
			je.posting_date,
			Sum(jea.debit_in_account_currency).as_("debit"),
			Sum(jea.credit_in_account_currency).as_("credit"),
			Max(jea.party).as_("party"),
			Max(je.cheque_no).as_("cheque_no"),
			Max(je.user_remark).as_("user_remark"),
		)
		.where(
			(jea.account == gl_account)
			& (je.docstatus == 1)
			& ((je.clearance_date.isnull()) | (je.clearance_date == "0000-00-00"))
			& ((je.is_opening.isnull()) | (je.is_opening == "No"))
		)
		.groupby(je.name, je.posting_date)
		.orderby(je.posting_date)
	)
	if from_date:
		query = query.where(je.posting_date >= from_date)
	if to_date:
		query = query.where(je.posting_date <= to_date)

	rows: list[dict[str, Any]] = []
	for row in query.run(as_dict=True):
		debit = float(row.debit or 0)
		credit = float(row.credit or 0)
		rows.append(
			{
				"doctype": "Journal Entry",
				"name": row.name,
				"date": str(row.posting_date) if row.posting_date else "",
				"party": row.party or "",
				"amount": debit or credit,
				"reference": row.cheque_no or row.user_remark or "",
				"type": "Journal Entry",
			}
		)
	return rows


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

	# clearance_date sits on Journal Entry. The account row has neither that field nor docstatus.
	if gl_account:
		results.extend(_uncleared_journals(gl_account, from_date, to_date))

	results.sort(key=lambda r: r["date"])
	return results


@frappe.whitelist()
def mark_cleared(doctype: str, name: str, clearance_date: str) -> dict[str, str]:
	"""Set clearance_date on a Payment Entry or on the Journal Entry itself."""
	require_login()
	if doctype == "Payment Entry":
		if not frappe.has_permission("Payment Entry", "write", name):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		frappe.db.set_value("Payment Entry", name, "clearance_date", clearance_date)
		frappe.db.commit()
	elif doctype == "Journal Entry":
		if not frappe.has_permission("Journal Entry", "write", name):
			frappe.throw(_("Not permitted"), frappe.PermissionError)
		if not frappe.db.exists("Journal Entry", name):
			frappe.throw(_("Not found"), frappe.DoesNotExistError)
		frappe.db.set_value(
			"Journal Entry",
			name,
			"clearance_date",
			clearance_date,
			update_modified=False,
		)
		frappe.db.commit()
	else:
		frappe.throw(_("Invalid doctype for reconciliation"), frappe.ValidationError)
	return {"status": "ok", "name": name}
