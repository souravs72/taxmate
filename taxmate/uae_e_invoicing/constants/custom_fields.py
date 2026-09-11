"""UAE E-Invoicing mandate custom fields (Company: government, FS band, override)."""

from __future__ import annotations

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_e_invoicing.constants import (
	EINVOICE_REVENUE_BAND_AT_OR_ABOVE,
	EINVOICE_REVENUE_BAND_BELOW,
)

_UAE_ONLY = f"eval:doc.country=='{UAE_COUNTRY}'"

CUSTOM_FIELDS = {
	"Company": [
		{
			"fieldname": "uae_e_invoice_mandate_section",
			"label": "UAE E-Invoicing Mandate",
			"fieldtype": "Section Break",
			"insert_after": "uae_in_designated_zone",
			"collapsible": 1,
			"depends_on": _UAE_ONLY,
		},
		{
			"fieldname": "uae_is_government_entity",
			"label": "Government / Government-Owned Entity",
			"fieldtype": "Check",
			"insert_after": "uae_e_invoice_mandate_section",
			"default": "0",
			"depends_on": _UAE_ONLY,
			"description": (
				"Government cohort: appoint an ASP by 31 Mar 2027, live from 1 Oct 2027 "
				"(MD 244/2025)."
			),
		},
		{
			"fieldname": "uae_e_invoice_revenue_band",
			"label": "Last Accounting Period FS Revenue (MD 244)",
			"fieldtype": "Select",
			"options": f"\n{EINVOICE_REVENUE_BAND_BELOW}\n{EINVOICE_REVENUE_BAND_AT_OR_ABOVE}",
			"insert_after": "uae_is_government_entity",
			"depends_on": _UAE_ONLY,
			"description": (
				"Gross revenue from the most recent accounting-period financial statements, "
				"as MD 244 uses for phasing. Not VAT 201 turnover and not TaxMate GL income. "
				"Leave empty until that figure is confirmed."
			),
		},
		{
			"fieldname": "uae_e_invoice_cohort_override",
			"label": "E-Invoicing Mandate Cohort (Override)",
			"fieldtype": "Select",
			"options": "Auto\nPilot\nLarge\nSME\nGovernment",
			"default": "Auto",
			"insert_after": "uae_e_invoice_revenue_band",
			"depends_on": _UAE_ONLY,
			"description": (
				"Leave as Auto to classify from the government flag and the FS revenue band. "
				"Override only if the FTA has notified this company of a different cohort "
				"(for example Pilot)."
			),
		},
	],
}
