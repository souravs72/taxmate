"""Pure helpers for UAE excise, capital goods, bad-debt, and margin VAT."""

from __future__ import annotations

from datetime import date

from frappe.utils import add_months, add_years, flt, getdate

from taxmate.uae_vat.constants.special_regimes import (
	BAD_DEBT_RELIEF_MONTHS,
	CAPITAL_YEARS_IMMOVABLE,
	CAPITAL_YEARS_OTHER,
	STANDARD_VAT_RATE,
)


def excise_tax(taxable_base, rate_percent) -> float:
	"""Excise due = tax base x designated rate. Rate 0 is allowed; blank is not."""
	if rate_percent is None:
		raise ValueError("excise rate is required")
	return flt(flt(taxable_base) * flt(rate_percent) / 100.0, 2)


def capital_adjustment_years(asset_class: str | None) -> int:
	if (asset_class or "").strip() == "Immovable":
		return CAPITAL_YEARS_IMMOVABLE
	return CAPITAL_YEARS_OTHER


def capital_goods_annual_adjustment(
	vat_amount,
	adjustment_years,
	intended_taxable_use_percent,
	actual_taxable_use_percent,
) -> float:
	"""FTA capital-assets annual adjustment.

	(VAT / years) x (actual taxable use % - intended %). Positive = extra
	recovery (Box 9 up); negative = clawback.
	"""
	years = int(adjustment_years or 0)
	if years <= 0:
		return 0.0
	delta = flt(actual_taxable_use_percent) - flt(intended_taxable_use_percent)
	return flt(flt(vat_amount) / years * delta / 100.0, 2)


def capital_goods_window_end(acquisition_date, adjustment_years):
	"""Last date an annual adjustment may be filed for this asset."""
	if not acquisition_date:
		return None
	years = int(adjustment_years or 0)
	if years <= 0:
		return None
	return getdate(add_years(getdate(acquisition_date), years))


def capital_goods_period_in_window(acquisition_date, adjustment_years, period_end) -> bool:
	"""True when period_end is on or after acquisition and within the FTA years."""
	if not acquisition_date or not period_end:
		return False
	acquired = getdate(acquisition_date)
	end = capital_goods_window_end(acquired, adjustment_years)
	posted = getdate(period_end)
	if not isinstance(acquired, date) or not isinstance(posted, date) or end is None:
		return False
	return acquired <= posted <= end


def bad_debt_eligible(due_date, write_off_date, min_months: int = BAD_DEBT_RELIEF_MONTHS) -> bool:
	"""True when write-off is on or after due date + min_months."""
	if not due_date or not write_off_date:
		return False
	due = getdate(due_date)
	written = getdate(write_off_date)
	if not isinstance(due, date) or not isinstance(written, date):
		return False
	return written >= getdate(add_months(due, int(min_months)))


def margin_amount(selling_net, purchase_price) -> float:
	"""Taxable margin. A commercial loss is zero; a credit note flips the original margin."""
	net = flt(selling_net)
	spread = abs(net) - flt(purchase_price)
	if spread <= 0:
		return 0.0
	sign = -1.0 if net < 0 else 1.0
	return flt(sign * spread, 2)


def margin_vat(margin, vat_rate: float = STANDARD_VAT_RATE) -> float:
	return flt(flt(margin) * flt(vat_rate) / 100.0, 2)


def merge_emirate_rows(base: list[dict], extra: list[dict]) -> list[dict]:
	"""Add extra amount/VAT into emirate rows (used for margin / bad-debt)."""
	by_emirate = {row["emirate"]: dict(row) for row in base}
	for row in extra:
		emirate = row.get("emirate")
		if not emirate:
			continue
		current = by_emirate.setdefault(emirate, {"emirate": emirate, "amount": 0.0, "vat_amount": 0.0})
		current["amount"] = flt(current["amount"] + flt(row.get("amount")), 2)
		current["vat_amount"] = flt(current["vat_amount"] + flt(row.get("vat_amount")), 2)
	return list(by_emirate.values())
