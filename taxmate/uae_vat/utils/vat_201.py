"""UAE VAT Form 201 box computation.

Fixes the previously-stub ``EmaraTax Export`` report. Computes every one of
the FTA's 14 VAT 201 boxes for a Company + period, for review before the
figures are typed into the EmaraTax portal (or attached as backup for a
filing already submitted).

Boxes 1-5, 9 and 10 are derived from ERPNext ledger data using the same
underlying fields as ERPNext's own ``erpnext.regional.report.uae_vat_201``
report (emirate-wise standard-rated sales, tourist refunds, reverse-charge
supplies, zero-rated/exempt supplies, standard-rated expenses, and
recoverable reverse-charge input). ERPNext's report stops there -- it never
totals the return.

Boxes 6 and 7 (value of goods imported through UAE Customs, and adjustments
to previously-declared imports) are **always manual input**. ERPNext has no
doctype for a customs import declaration, so guessing these from ledger data
would silently produce a wrong VAT 201 -- a manual-entry box that is
obviously blank is safer than an auto-computed box that is quietly wrong.

Boxes 8, 11, 12, 13 and 14 are the totals ERPNext's report never computes;
:func:`compute_totals` does that arithmetic as a pure function so it can be
unit tested without a live site (see ``tests/test_uae_vat_201.py``).
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import flt, getdate

from taxmate.uae.constants import UAE_COUNTRY

CURRENCY_PRECISION = 2

# Official FTA VAT 201 box order for emirate-wise standard-rated supplies
# (1a-1g). This is the form's printed order, not alphabetical -- it differs
# from taxmate.uae.constants.UAE_EMIRATES on purpose.
VAT_201_EMIRATE_ORDER = (
	"Abu Dhabi",
	"Dubai",
	"Sharjah",
	"Ajman",
	"Umm Al Quwain",
	"Ras Al Khaimah",
	"Fujairah",
)


def r2(value) -> float:
	"""Round to AED's 2 decimal places, the precision VAT 201 is filed at."""
	return flt(value, CURRENCY_PRECISION)


def compute_vat_201(
	company: str,
	period_start,
	period_end,
	box_6_amount: float = 0,
	box_6_vat_amount: float = 0,
	box_7_amount: float = 0,
	box_7_vat_amount: float = 0,
) -> dict[str, Any]:
	"""Return every box of VAT Form 201 for ``company`` for the given period.

	``box_6_*`` / ``box_7_*`` are manual inputs -- see module docstring.
	Pass them from a ``UAE VAT 201 Filing Log`` once one exists for the
	period, or leave at 0 for a first draft.
	"""
	_validate_company(company)
	period_start, period_end = getdate(period_start), getdate(period_end)
	if period_end < period_start:
		frappe.throw(_("Period end date cannot be before period start date."))

	filters = {"company": company, "from_date": period_start, "to_date": period_end}

	box_1_rows = _standard_rated_emiratewise(filters)
	box_2 = _tourist_refund(filters)
	box_3 = _reverse_charge_output(filters)
	box_4_amount = _zero_rated_total(filters)
	box_5_amount = _exempt_total(filters)
	box_9 = _standard_rated_expenses(filters)
	box_10 = _reverse_charge_recoverable_input(filters)

	box_1_amount = r2(sum(row["amount"] for row in box_1_rows))
	box_1_vat_amount = r2(sum(row["vat_amount"] for row in box_1_rows))

	totals = compute_totals(
		box_1_vat_amount=box_1_vat_amount,
		box_2_vat_amount=box_2["vat_amount"],
		box_3_vat_amount=box_3["vat_amount"],
		box_6_vat_amount=r2(box_6_vat_amount),
		box_7_vat_amount=r2(box_7_vat_amount),
		box_9_vat_amount=box_9["vat_amount"],
		box_10_vat_amount=box_10["vat_amount"],
	)

	boxes: list[dict[str, Any]] = []
	for i, row in enumerate(box_1_rows, start=1):
		boxes.append(
			{
				"box_no": f"1{chr(96 + i)}",  # 1a, 1b, ...
				"legend": _("Standard rated supplies in {0}").format(row["emirate"]),
				"amount": row["amount"],
				"vat_amount": row["vat_amount"],
			}
		)
	boxes.append(
		{
			"box_no": "2",
			"legend": _("Tax Refunds provided to Tourists under the Tax Refunds for Tourists Scheme"),
			"amount": -box_2["amount"],
			"vat_amount": -box_2["vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "3",
			"legend": _("Supplies subject to the reverse charge provisions"),
			"amount": box_3["amount"],
			"vat_amount": box_3["vat_amount"],
		}
	)
	boxes.append({"box_no": "4", "legend": _("Zero rated supplies"), "amount": box_4_amount, "vat_amount": 0})
	boxes.append({"box_no": "5", "legend": _("Exempt supplies"), "amount": box_5_amount, "vat_amount": 0})
	boxes.append(
		{
			"box_no": "6",
			"legend": _("Goods imported into the UAE (manual entry -- see note)"),
			"amount": r2(box_6_amount),
			"vat_amount": r2(box_6_vat_amount),
		}
	)
	boxes.append(
		{
			"box_no": "7",
			"legend": _("Adjustments to goods imported into the UAE (manual entry -- see note)"),
			"amount": r2(box_7_amount),
			"vat_amount": r2(box_7_vat_amount),
		}
	)
	boxes.append(
		{
			"box_no": "8",
			"legend": _("Total value of due tax for the period"),
			"amount": "",
			"vat_amount": totals["box_8_vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "9",
			"legend": _("Standard rated expenses"),
			"amount": box_9["amount"],
			"vat_amount": box_9["vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "10",
			"legend": _("Supplies subject to the reverse charge provisions (recoverable)"),
			"amount": box_10["amount"],
			"vat_amount": box_10["vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "11",
			"legend": _("Total value of recoverable tax for the period"),
			"amount": "",
			"vat_amount": totals["box_11_vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "12",
			"legend": _("Total value of due tax for the period"),
			"amount": "",
			"vat_amount": totals["box_12_vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "13",
			"legend": _("Total value of recoverable tax for the period"),
			"amount": "",
			"vat_amount": totals["box_13_vat_amount"],
		}
	)
	boxes.append(
		{
			"box_no": "14",
			"legend": _("Payable tax for the period")
			if totals["net_vat_due"] >= 0
			else _("Refundable / reclaimable tax for the period"),
			"amount": "",
			"vat_amount": totals["net_vat_due"],
		}
	)

	subtotal_boxes = {"8", "11", "12", "13", "14"}
	for row in boxes:
		row["is_subtotal"] = row["box_no"] in subtotal_boxes
		if row["amount"] == "":
			row["amount"] = 0

	return {
		"company": company,
		"period_start": period_start,
		"period_end": period_end,
		"boxes": boxes,
		**totals,
		"requires_manual_box_6_7": True,
	}


def compute_totals(
	box_1_vat_amount: float,
	box_2_vat_amount: float,
	box_3_vat_amount: float,
	box_6_vat_amount: float,
	box_7_vat_amount: float,
	box_9_vat_amount: float,
	box_10_vat_amount: float,
) -> dict[str, float]:
	"""Pure arithmetic for VAT 201 Boxes 8, 11, 12, 13 and 14.

	No DB access -- this is the piece that is unit tested directly. Box 2
	(tourist refunds) reduces output tax; Boxes 1/3/6/7 add to it. Box 11 is
	recoverable input tax (Boxes 9 + 10). Box 14 is Box 12 minus Box 13: a
	positive value is payable to the FTA, a negative value is reclaimable.
	"""
	box_8_vat_amount = r2(
		box_1_vat_amount - box_2_vat_amount + box_3_vat_amount + box_6_vat_amount + box_7_vat_amount
	)
	box_11_vat_amount = r2(box_9_vat_amount + box_10_vat_amount)
	box_12_vat_amount = box_8_vat_amount
	box_13_vat_amount = box_11_vat_amount
	net_vat_due = r2(box_12_vat_amount - box_13_vat_amount)

	return {
		"box_8_vat_amount": box_8_vat_amount,
		"box_11_vat_amount": box_11_vat_amount,
		"box_12_vat_amount": box_12_vat_amount,
		"box_13_vat_amount": box_13_vat_amount,
		"net_vat_due": net_vat_due,
	}


# ----------------------------------------------------------------------
# Ledger fetchers (Boxes 1-5, 9-10) -- same source fields ERPNext's own
# uae_vat_201 regional report uses.
# ----------------------------------------------------------------------


def _validate_company(company: str) -> None:
	if not company:
		frappe.throw(_("Company is required"))
	if not frappe.has_permission("Company", "read", company):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	country = frappe.db.get_value("Company", company, "country")
	if country != UAE_COUNTRY:
		frappe.throw(
			_("{0} is not in the United Arab Emirates. VAT 201 applies only to UAE companies.").format(
				frappe.bold(company)
			)
		)


def _standard_rated_emiratewise(filters: dict) -> list[dict[str, Any]]:
	"""Box 1a-g: standard-rated supplies by Emirate (FTA print order).

	Mirrors ERPNext regional UAE VAT 201 item aggregation, with NULL-safe
	exempt/zero-rated flags so legacy rows are not silently dropped.
	``tax_amount`` is ERPNext's per-line allocated tax (UAE templates are VAT-only).
	"""
	rows = frappe.db.sql(
		"""
		select s.vat_emirate as emirate, sum(i.base_net_amount) as amount, sum(i.tax_amount) as vat_amount
		from `tabSales Invoice Item` i
		inner join `tabSales Invoice` s on i.parent = s.name
		where
			s.docstatus = 1 and s.company = %(company)s
			and s.posting_date between %(from_date)s and %(to_date)s
			and ifnull(i.is_exempt, 0) != 1
			and ifnull(i.is_zero_rated, 0) != 1
		group by s.vat_emirate
		""",
		filters,
		as_dict=True,
	)
	by_emirate = {row.emirate: row for row in rows if row.emirate}
	return [
		{
			"emirate": emirate,
			"amount": r2(by_emirate[emirate].amount) if emirate in by_emirate else 0,
			"vat_amount": r2(by_emirate[emirate].vat_amount) if emirate in by_emirate else 0,
		}
		for emirate in VAT_201_EMIRATE_ORDER
	]


def _tourist_refund(filters: dict) -> dict[str, float]:
	row = frappe.db.get_all(
		"Sales Invoice",
		filters={
			"company": filters["company"],
			"posting_date": ["between", [filters["from_date"], filters["to_date"]]],
			"docstatus": 1,
			"tourist_tax_return": [">", 0],
		},
		fields=["sum(base_total) as amount", "sum(tourist_tax_return) as vat_amount"],
		as_list=False,
	)
	data = row[0] if row else {}
	return {"amount": r2(data.get("amount") or 0), "vat_amount": r2(data.get("vat_amount") or 0)}


def _reverse_charge_output(filters: dict) -> dict[str, float]:
	amount = (
		frappe.db.get_all(
			"Purchase Invoice",
			filters={
				"company": filters["company"],
				"posting_date": ["between", [filters["from_date"], filters["to_date"]]],
				"docstatus": 1,
				"reverse_charge": "Y",
			},
			fields=["sum(base_total) as amount"],
		)[0].amount
		or 0
	)
	vat_amount = (
		frappe.db.sql(
			"""
			select sum(gl.debit)
			from `tabPurchase Invoice` p
			inner join `tabGL Entry` gl on gl.voucher_no = p.name
			where
				p.reverse_charge = 'Y' and p.docstatus = 1 and gl.docstatus = 1
				and ifnull(gl.is_cancelled, 0) = 0
				and p.company = %(company)s
				and p.posting_date between %(from_date)s and %(to_date)s
				and gl.account in (select account from `tabUAE VAT Account` where parent = %(company)s)
			""",
			filters,
		)[0][0]
		or 0
	)
	return {"amount": r2(amount), "vat_amount": r2(vat_amount)}


def _reverse_charge_recoverable_input(filters: dict) -> dict[str, float]:
	amount = (
		frappe.db.get_all(
			"Purchase Invoice",
			filters={
				"company": filters["company"],
				"posting_date": ["between", [filters["from_date"], filters["to_date"]]],
				"docstatus": 1,
				"reverse_charge": "Y",
				"recoverable_reverse_charge": [">", 0],
			},
			fields=["sum(base_total) as amount"],
		)[0].amount
		or 0
	)
	vat_amount = (
		frappe.db.sql(
			"""
			select sum(gl.debit * p.recoverable_reverse_charge / 100)
			from `tabPurchase Invoice` p
			inner join `tabGL Entry` gl on gl.voucher_no = p.name
			where
				p.reverse_charge = 'Y' and p.docstatus = 1 and gl.docstatus = 1
				and ifnull(gl.is_cancelled, 0) = 0
				and p.recoverable_reverse_charge > 0
				and p.company = %(company)s
				and p.posting_date between %(from_date)s and %(to_date)s
				and gl.account in (select account from `tabUAE VAT Account` where parent = %(company)s)
			""",
			filters,
		)[0][0]
		or 0
	)
	return {"amount": r2(amount), "vat_amount": r2(vat_amount)}


def include_in_box_9(recoverable: float) -> bool:
	"""Purchase invoices with non-zero recoverable VAT enter Box 9 (including credit notes)."""
	return flt(recoverable) != 0


def _standard_rated_expenses(filters: dict) -> dict[str, float]:
	"""Box 9: recoverable standard-rated expenses (FTA worksheet).

	VAT amount comes from Purchase Invoice.recoverable_standard_rated_expenses
	(ERPNext UAE regional field — operators / TaxMate auto-fill set this).
	Amount uses uae_box_9_taxable_amount (recoverable lines only), else base_net_total.
	Includes negatives so purchase credit notes net Box 9 (``!= 0``, not ``> 0``).
	"""
	row = frappe.db.get_all(
		"Purchase Invoice",
		filters={
			"company": filters["company"],
			"posting_date": ["between", [filters["from_date"], filters["to_date"]]],
			"docstatus": 1,
			"recoverable_standard_rated_expenses": ["!=", 0],
		},
		fields=[
			"sum(uae_box_9_taxable_amount) as amount"
			if frappe.db.has_column("Purchase Invoice", "uae_box_9_taxable_amount")
			else "sum(base_net_total) as amount",
			"sum(recoverable_standard_rated_expenses) as vat_amount",
		],
	)
	data = row[0] if row else {}
	return {"amount": r2(data.get("amount") or 0), "vat_amount": r2(data.get("vat_amount") or 0)}


def _zero_rated_total(filters: dict) -> float:
	value = frappe.db.sql(
		"""
		select sum(i.base_net_amount)
		from `tabSales Invoice Item` i
		inner join `tabSales Invoice` s on i.parent = s.name
		where
			s.docstatus = 1 and ifnull(i.is_zero_rated, 0) = 1
			and s.company = %(company)s
			and s.posting_date between %(from_date)s and %(to_date)s
		""",
		filters,
	)[0][0]
	return r2(value or 0)


def _exempt_total(filters: dict) -> float:
	value = frappe.db.sql(
		"""
		select sum(i.base_net_amount)
		from `tabSales Invoice Item` i
		inner join `tabSales Invoice` s on i.parent = s.name
		where
			s.docstatus = 1 and ifnull(i.is_exempt, 0) = 1
			and s.company = %(company)s
			and s.posting_date between %(from_date)s and %(to_date)s
		""",
		filters,
	)[0][0]
	return r2(value or 0)
