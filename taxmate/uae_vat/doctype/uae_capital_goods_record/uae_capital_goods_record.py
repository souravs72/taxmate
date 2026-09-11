# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.constants.special_regimes import CAPITAL_GOODS_THRESHOLD_AED
from taxmate.uae_vat.utils.special_regimes import capital_adjustment_years


class UAECapitalGoodsRecord(Document):
	def validate(self):
		if frappe.db.get_value("Company", self.company, "country") != UAE_COUNTRY:
			frappe.throw(_("Capital goods records are only for UAE companies."))
		self.adjustment_years = capital_adjustment_years(self.asset_class)
		if flt(self.cost_excluding_vat) < CAPITAL_GOODS_THRESHOLD_AED and not self.below_threshold:
			frappe.throw(
				_(
					"Cost {0} is below the FTA capital-assets threshold of AED {1}. "
					"Tick Below Threshold only if this is a memo, not a scheme asset."
				).format(self.cost_excluding_vat, CAPITAL_GOODS_THRESHOLD_AED)
			)
		if not self.asset and not self.purchase_invoice:
			frappe.throw(_("Link an Asset or the Purchase Invoice that acquired it."))
		if self.asset and frappe.db.exists("DocType", "Asset"):
			asset_company = frappe.db.get_value("Asset", self.asset, "company")
			if asset_company and asset_company != self.company:
				frappe.throw(
					_("Asset {0} belongs to {1}, not {2}.").format(self.asset, asset_company, self.company)
				)
		if self.purchase_invoice:
			pi_company = frappe.db.get_value("Purchase Invoice", self.purchase_invoice, "company")
			if pi_company and pi_company != self.company:
				frappe.throw(
					_("Purchase Invoice {0} belongs to {1}, not {2}.").format(
						self.purchase_invoice, pi_company, self.company
					)
				)
