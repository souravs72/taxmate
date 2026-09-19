"""Pure helpers for UAE VAT group membership and merged returns."""

from __future__ import annotations

from datetime import date

from frappe.utils import flt, getdate

from taxmate.uae_vat.utils.vat_201 import r2


def date_windows_overlap(from_a, to_a, from_b, to_b) -> bool:
	"""True when two [from, to] windows overlap. Blank ``to`` means still open."""
	start_a = getdate(from_a)
	start_b = getdate(from_b)
	if not isinstance(start_a, date) or not isinstance(start_b, date):
		return False
	end_a = getdate(to_a) if to_a else date.max
	end_b = getdate(to_b) if to_b else date.max
	if not isinstance(end_a, date):
		end_a = date.max
	if not isinstance(end_b, date):
		end_b = date.max
	return start_a <= end_b and start_b <= end_a


def in_membership_window(as_of, from_date, to_date) -> bool:
	as_of_date = getdate(as_of)
	start = getdate(from_date)
	if not isinstance(as_of_date, date) or not isinstance(start, date):
		return False
	if as_of_date < start:
		return False
	if not to_date:
		return True
	end = getdate(to_date)
	return isinstance(end, date) and as_of_date <= end


def merge_vat_201_boxes(results: list[dict]) -> list[dict]:
	"""Sum non-total boxes by box_no. Caller rebuilds Boxes 8 and 11–14."""
	order: list[str] = []
	by_box: dict[str, dict] = {}
	skip = {"8", "11", "12", "13", "14"}
	for result in results:
		for row in result.get("boxes") or []:
			box_no = row.get("box_no")
			if not box_no or box_no in skip:
				continue
			if box_no not in by_box:
				order.append(box_no)
				by_box[box_no] = {
					"box_no": box_no,
					"legend": row.get("legend"),
					"amount": 0.0,
					"vat_amount": 0.0,
					"is_subtotal": 0,
				}
			by_box[box_no]["amount"] = r2(by_box[box_no]["amount"] + flt(row.get("amount")))
			by_box[box_no]["vat_amount"] = r2(by_box[box_no]["vat_amount"] + flt(row.get("vat_amount")))
	return [by_box[key] for key in order]


def members_in_period(vat_group: str, period_start, period_end) -> list[str]:
	"""Company names in a submitted (or draft) VAT group overlapping the period."""
	import frappe

	if not vat_group or not frappe.db.exists("DocType", "UAE VAT Group"):
		return []
	rows = frappe.get_all(
		"UAE VAT Group Member",
		filters={"parent": vat_group, "parenttype": "UAE VAT Group"},
		fields=["company", "from_date", "to_date"],
	)
	companies = []
	for row in rows:
		if date_windows_overlap(row.from_date, row.to_date, period_start, period_end):
			if row.company and row.company not in companies:
				companies.append(row.company)
	return companies


def active_group_for_company(company: str, as_of) -> dict | None:
	"""Submitted VAT group covering ``company`` on ``as_of``, if any."""
	import frappe

	if not company or not as_of or not frappe.db.exists("DocType", "UAE VAT Group"):
		return None
	groups = frappe.get_all(
		"UAE VAT Group",
		filters={"docstatus": 1},
		fields=["name", "representative_company", "group_trn"],
	)
	for group in groups:
		for row in frappe.get_all(
			"UAE VAT Group Member",
			filters={"parent": group.name, "parenttype": "UAE VAT Group", "company": company},
			fields=["from_date", "to_date", "is_representative"],
		):
			if in_membership_window(as_of, row.from_date, row.to_date):
				return {
					"name": group.name,
					"representative_company": group.representative_company,
					"group_trn": group.group_trn,
					"is_representative": int(row.is_representative or 0),
				}
	return None
