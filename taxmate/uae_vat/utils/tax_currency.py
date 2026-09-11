"""AED tax currency helpers for VAT 201 (PINT already files in AED)."""

from __future__ import annotations

from frappe.utils import flt

from taxmate.uae_e_invoicing.constants import AED_CURRENCY

CURRENCY_PRECISION = 2


def company_to_aed_rate(company: str, conversion_date) -> float:
	"""Exchange rate from the company's default currency into AED (tax currency)."""
	import frappe
	from frappe import _

	currency = frappe.db.get_value("Company", company, "default_currency") or AED_CURRENCY
	if currency == AED_CURRENCY:
		return 1.0
	from erpnext.setup.utils import get_exchange_rate

	rate = get_exchange_rate(currency, AED_CURRENCY, conversion_date) or 0
	if flt(rate) <= 0:
		frappe.throw(
			_(
				"Set a Currency Exchange from {0} to AED on {1} so VAT 201 can be prepared in tax currency AED."
			).format(currency, conversion_date)
		)
	return flt(rate)


def to_aed(amount, rate) -> float:
	"""Convert a company-currency amount to AED using ``rate`` (AED per 1 unit)."""
	return flt(flt(amount) * (flt(rate) or 1.0), CURRENCY_PRECISION)


def scale_boxes(boxes: list[dict], rate) -> list[dict]:
	"""Multiply amount/vat_amount on VAT 201 box rows."""
	if flt(rate) == 1:
		return boxes
	out = []
	for row in boxes:
		scaled = dict(row)
		scaled["amount"] = to_aed(row.get("amount"), rate)
		scaled["vat_amount"] = to_aed(row.get("vat_amount"), rate)
		out.append(scaled)
	return out
