# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.utils.period_lock import validate_period_lock
from taxmate.uae_vat.utils.special_regimes import (
	capital_goods_annual_adjustment,
	capital_goods_period_in_window,
)


class UAECapitalGoodsAdjustment(Document):
	def validate(self):
		if getdate(self.period_end) < getdate(self.period_start):
			frappe.throw(_("Period End cannot be before Period Start."))
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("Capital goods adjustments are only for UAE companies."))
		_assert_one_active_period(self)
		validate_period_lock(self, self.period_end)
		total_cost = 0.0
		total_vat = 0.0
		seen = set()
		for row in self.rows or []:
			if not row.capital_goods_record:
				continue
			if row.capital_goods_record in seen:
				frappe.throw(
					_("Row #{0}: capital goods record {1} is listed twice.").format(
						row.idx, row.capital_goods_record
					)
				)
			seen.add(row.capital_goods_record)
			record = frappe.get_cached_doc("UAE Capital Goods Record", row.capital_goods_record)
			if record.company != self.company:
				frappe.throw(_("Row #{0}: record belongs to {1}.").format(row.idx, record.company))
			if record.below_threshold:
				row.adjustment_amount = 0
				row.adjustment_vat = 0
				continue
			if not capital_goods_period_in_window(
				record.acquisition_date, record.adjustment_years, self.period_end
			):
				frappe.throw(
					_(
						"Row #{0}: period end {1} is outside the {2}-year adjustment window "
						"from acquisition {3}."
					).format(
						row.idx,
						self.period_end,
						record.adjustment_years,
						record.acquisition_date,
					)
				)
			row.adjustment_vat = capital_goods_annual_adjustment(
				record.vat_amount,
				record.adjustment_years,
				record.intended_taxable_use_percent,
				row.actual_taxable_use_percent,
			)
			row.adjustment_amount = capital_goods_annual_adjustment(
				record.cost_excluding_vat,
				record.adjustment_years,
				record.intended_taxable_use_percent,
				row.actual_taxable_use_percent,
			)
			total_cost += flt(row.adjustment_amount)
			total_vat += flt(row.adjustment_vat)
		self.adjustment_amount = flt(total_cost, 2)
		self.adjustment_vat = flt(total_vat, 2)

	def before_submit(self):
		if not self.rows:
			frappe.throw(_("Add at least one capital goods row before submitting."))

	def before_cancel(self):
		validate_period_lock(self, self.period_end)


def _assert_one_active_period(doc) -> None:
	existing = frappe.db.exists(
		"UAE Capital Goods Adjustment",
		{
			"company": doc.company,
			"period_end": doc.period_end,
			"docstatus": ["<", 2],
			"name": ["!=", doc.name or ""],
		},
	)
	if existing:
		frappe.throw(
			_(
				"Capital goods adjustment {0} already covers this company and period end. "
				"Cancel or amend that document first."
			).format(existing)
		)
