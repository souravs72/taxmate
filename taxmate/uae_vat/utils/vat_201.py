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

Boxes 6 and 7 come from submitted ``UAE Customs Declaration`` rows for the
period (still overridable on the Filing Log). Do not infer imports from
Purchase Invoice VAT -- that is not a customs bill.

Boxes 8, 11, 12, 13 and 14 are the totals ERPNext's report never computes;
:func:`compute_totals` does that arithmetic as a pure function so it can be
unit tested without a live site (see ``tests/test_uae_vat_201.py``).
"""

from __future__ import annotations

from typing import Any

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

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


def reminder_lead_days() -> int:
	"""Days before the FTA due date (period end + 28) to mark a draft as Due."""
	from taxmate.uae.validation import get_taxmate_settings, singles_field_is_set

	settings = get_taxmate_settings()
	if (
		settings
		and settings.meta.has_field("vat_201_reminder_days")
		and singles_field_is_set("vat_201_reminder_days")
	):
		return int(settings.vat_201_reminder_days)
	return 7


def filing_deadline_status(due_date, docstatus: int, today=None, lead_days: int = 7) -> str:
	"""Upcoming / Due / Overdue / Filed for a VAT 201 log."""
	if docstatus == 1:
		return "Filed"
	if not due_date:
		return "Upcoming"
	from frappe.utils import add_days, nowdate

	today = getdate(today or nowdate())
	due = getdate(due_date)
	if today > due:
		return "Overdue"
	if today >= add_days(due, -lead_days):
		return "Due"
	return "Upcoming"


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

	``box_6_*`` / ``box_7_*`` are customs totals (or operator overrides).
	"""
	_validate_company(company)
	_validate_uae_vat_accounts(company)
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
			"legend": _("Goods imported into the UAE"),
			"amount": r2(box_6_amount),
			"vat_amount": r2(box_6_vat_amount),
		}
	)
	boxes.append(
		{
			"box_no": "7",
			"legend": _("Adjustments to goods imported into the UAE"),
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
		"requires_manual_box_6_7": False,
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


def _validate_uae_vat_accounts(company: str) -> None:
	if not frappe.db.exists("UAE VAT Account", {"parent": company}):
		frappe.throw(
			_("Link VAT accounts in UAE VAT Settings for {0} before computing VAT 201.").format(
				frappe.bold(company)
			),
			title=_("UAE VAT Accounts Missing"),
		)


BOX_1_EXCLUDED_CATEGORIES = (
	"Out of Scope",
	"Exempt",
	"Zero Rated",
	"Reverse Charge",
	"Margin Scheme",
)


def _standard_rated_emiratewise(filters: dict) -> list[dict[str, Any]]:
	"""Box 1a-g: standard-rated supplies by Emirate (FTA print order).

	Consideration is item net (excluding exempt / zero / out-of-scope / RCM /
	margin). VAT is taken only from Sales Taxes whose account is listed on
	UAE VAT Settings — extra invoice taxes must not inflate Box 1.
	"""
	amount_rows = frappe.db.sql(_box_1_amount_sql(), filters, as_dict=True)
	vat_rows = frappe.db.sql(_box_1_vat_sql(), filters, as_dict=True)
	by_amount = {row.emirate: row.amount for row in amount_rows}
	by_vat = {row.emirate: row.vat_amount for row in vat_rows}
	unknown = []
	for emirate, amount in by_amount.items():
		if emirate not in VAT_201_EMIRATE_ORDER and flt(amount):
			unknown.append(emirate or _("(blank)"))
	for emirate, vat_amount in by_vat.items():
		if emirate not in VAT_201_EMIRATE_ORDER and flt(vat_amount):
			unknown.append(emirate or _("(blank)"))
	if unknown:
		frappe.throw(
			_(
				"VAT 201 Box 1 includes invoices whose Place of Supply is not a UAE Emirate: {0}. "
				"Set vat_emirate before filing."
			).format(", ".join(sorted(set(unknown)))),
			title=_("Place of Supply Missing"),
		)
	return [
		{
			"emirate": emirate,
			"amount": r2(by_amount.get(emirate) or 0),
			"vat_amount": r2(by_vat.get(emirate) or 0),
		}
		for emirate in VAT_201_EMIRATE_ORDER
	]


def _box_1_item_predicates() -> tuple[str, str]:
	category_join = ""
	category_filter = ""
	if frappe.db.has_column("Item Tax Template", "uae_vat_category"):
		excluded = ", ".join(frappe.db.escape(c) for c in BOX_1_EXCLUDED_CATEGORIES)
		category_join = "left join `tabItem Tax Template` t on t.name = i.item_tax_template"
		category_filter = f"and ifnull(t.uae_vat_category, '') not in ({excluded})"
	return category_join, category_filter


def _box_1_amount_sql() -> str:
	category_join, category_filter = _box_1_item_predicates()
	return f"""
		select s.vat_emirate as emirate, sum(i.base_net_amount) as amount
		from `tabSales Invoice Item` i
		inner join `tabSales Invoice` s on i.parent = s.name
		{category_join}
		where
			s.docstatus = 1 and s.company = %(company)s
			and s.posting_date between %(from_date)s and %(to_date)s
			and ifnull(i.is_exempt, 0) != 1
			and ifnull(i.is_zero_rated, 0) != 1
			{category_filter}
		group by s.vat_emirate
	"""


def _box_1_vat_sql() -> str:
	category_join, category_filter = _box_1_item_predicates()
	return f"""
		select s.vat_emirate as emirate, sum(tax.base_tax_amount) as vat_amount
		from `tabSales Taxes and Charges` tax
		inner join `tabSales Invoice` s on tax.parent = s.name
		where
			s.docstatus = 1
			and tax.parenttype = 'Sales Invoice'
			and s.company = %(company)s
			and s.posting_date between %(from_date)s and %(to_date)s
			and tax.account_head in (
				select account from `tabUAE VAT Account` where parent = %(company)s
			)
			and exists (
				select 1 from `tabSales Invoice Item` i
				{category_join}
				where i.parent = s.name
					and ifnull(i.is_exempt, 0) != 1
					and ifnull(i.is_zero_rated, 0) != 1
					{category_filter}
			)
		group by s.vat_emirate
	"""


def sum_customs_declarations(company: str, period_start, period_end) -> dict[str, float]:
	"""Box 6 (imports) and Box 7 (adjustments) from submitted customs bills."""
	empty = {"box_6_amount": 0.0, "box_6_vat_amount": 0.0, "box_7_amount": 0.0, "box_7_vat_amount": 0.0}
	if not frappe.db.exists("DocType", "UAE Customs Declaration"):
		return empty
	rows = frappe.db.sql(
		"""
		select is_adjustment, sum(taxable_amount) as amount, sum(vat_amount) as vat_amount
		from `tabUAE Customs Declaration`
		where company = %(company)s and docstatus = 1
			and posting_date between %(from_date)s and %(to_date)s
		group by is_adjustment
		""",
		{"company": company, "from_date": period_start, "to_date": period_end},
		as_dict=True,
	)
	out = dict(empty)
	for row in rows:
		prefix = "box_7" if cint(row.is_adjustment) else "box_6"
		out[f"{prefix}_amount"] = r2(row.amount or 0)
		out[f"{prefix}_vat_amount"] = r2(row.vat_amount or 0)
	return out


def list_period_invoices(company: str, period_start, period_end) -> list[dict[str, Any]]:
	"""SI/PI listing for the accountant pack (this company and TRN only)."""
	sales = frappe.get_all(
		"Sales Invoice",
		filters={
			"company": company,
			"docstatus": 1,
			"posting_date": ["between", [period_start, period_end]],
		},
		fields=[
			"name",
			"posting_date",
			"customer as party",
			"vat_emirate",
			"base_net_total",
			"base_total_taxes_and_charges",
			"is_return",
		],
		order_by="posting_date, name",
	)
	purchases = frappe.get_all(
		"Purchase Invoice",
		filters={
			"company": company,
			"docstatus": 1,
			"posting_date": ["between", [period_start, period_end]],
		},
		fields=[
			"name",
			"posting_date",
			"supplier as party",
			"base_net_total",
			"base_total_taxes_and_charges",
			"recoverable_standard_rated_expenses",
			"is_return",
		],
		order_by="posting_date, name",
	)
	sales_vat = _uae_vat_by_voucher("Sales Invoice", company, period_start, period_end)
	purchase_vat = _uae_vat_by_voucher("Purchase Invoice", company, period_start, period_end)
	rows = []
	for row in sales:
		rows.append({**row, "doctype": "Sales Invoice", "uae_vat_amount": r2(sales_vat.get(row.name) or 0)})
	for row in purchases:
		rows.append(
			{
				**row,
				"doctype": "Purchase Invoice",
				"vat_emirate": "",
				"uae_vat_amount": r2(purchase_vat.get(row.name) or 0),
			}
		)
	return rows


def _uae_vat_by_voucher(doctype: str, company: str, period_start, period_end) -> dict[str, float]:
	"""Header UAE VAT per submitted voucher (accountant pack, not all invoice taxes)."""
	if doctype == "Sales Invoice":
		tax_table = "tabSales Taxes and Charges"
	elif doctype == "Purchase Invoice":
		tax_table = "tabPurchase Taxes and Charges"
	else:
		return {}
	parent_table = f"tab{doctype}"
	rows = frappe.db.sql(
		f"""
		select tax.parent as name, sum(tax.base_tax_amount) as uae_vat
		from `{tax_table}` tax
		inner join `{parent_table}` p on tax.parent = p.name
		where p.docstatus = 1 and tax.parenttype = %(doctype)s
			and p.company = %(company)s
			and p.posting_date between %(from_date)s and %(to_date)s
			and tax.account_head in (
				select account from `tabUAE VAT Account` where parent = %(company)s
			)
		group by tax.parent
		""",
		{
			"doctype": doctype,
			"company": company,
			"from_date": period_start,
			"to_date": period_end,
		},
		as_dict=True,
	)
	return {row.name: row.uae_vat or 0 for row in rows}


def list_period_customs(company: str, period_start, period_end) -> list[dict[str, Any]]:
	"""Submitted customs bills in the period (accountant pack)."""
	if not frappe.db.exists("DocType", "UAE Customs Declaration"):
		return []
	return frappe.get_all(
		"UAE Customs Declaration",
		filters={
			"company": company,
			"docstatus": 1,
			"posting_date": ["between", [period_start, period_end]],
		},
		fields=["name", "posting_date", "declaration_number", "is_adjustment", "taxable_amount", "vat_amount"],
		order_by="posting_date, name",
	)


def _tourist_refund(filters: dict) -> dict[str, float]:
	row = frappe.db.sql(
		"""
		select sum(base_total) as amount, sum(tourist_tax_return) as vat_amount
		from `tabSales Invoice`
		where docstatus = 1 and tourist_tax_return > 0
			and company = %(company)s
			and posting_date between %(from_date)s and %(to_date)s
		""",
		filters,
		as_dict=True,
	)
	data = row[0] if row else {}
	return {"amount": r2(data.get("amount") or 0), "vat_amount": r2(data.get("vat_amount") or 0)}


def _reverse_charge_output(filters: dict) -> dict[str, float]:
	amount = (
		frappe.db.sql(
			"""
			select sum(base_total)
			from `tabPurchase Invoice`
			where docstatus = 1 and reverse_charge = 'Y'
				and company = %(company)s
				and posting_date between %(from_date)s and %(to_date)s
			""",
			filters,
		)[0][0]
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
				and gl.voucher_type = 'Purchase Invoice'
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
		frappe.db.sql(
			"""
			select sum(base_total)
			from `tabPurchase Invoice`
			where docstatus = 1 and reverse_charge = 'Y'
				and recoverable_reverse_charge > 0
				and company = %(company)s
				and posting_date between %(from_date)s and %(to_date)s
			""",
			filters,
		)[0][0]
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
				and gl.voucher_type = 'Purchase Invoice'
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
	amount_col = (
		"uae_box_9_taxable_amount"
		if frappe.db.has_column("Purchase Invoice", "uae_box_9_taxable_amount")
		else "base_net_total"
	)
	row = frappe.db.sql(
		f"""
		select sum(`{amount_col}`) as amount, sum(recoverable_standard_rated_expenses) as vat_amount
		from `tabPurchase Invoice`
		where docstatus = 1 and recoverable_standard_rated_expenses != 0
			and company = %(company)s
			and posting_date between %(from_date)s and %(to_date)s
		""",
		filters,
		as_dict=True,
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
