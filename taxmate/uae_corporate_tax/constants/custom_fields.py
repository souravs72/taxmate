"""TaxMate-owned custom fields for UAE Corporate Tax (related party + QFZP class)."""

from __future__ import annotations

INVOICE_CT_FIELDS = [
	{
		"fieldname": "uae_ct_section",
		"label": "UAE Corporate Tax",
		"fieldtype": "Section Break",
		"collapsible": 1,
		"insert_after": "taxes_and_charges",
	},
	{
		"fieldname": "uae_related_party",
		"label": "Related Party Transaction",
		"fieldtype": "Check",
		"default": "0",
		"insert_after": "uae_ct_section",
		"description": "Set automatically when the party is on UAE Related Party. Used for the CT documentation pack.",
	},
	{
		"fieldname": "uae_ct_income_class",
		"label": "CT Income Class",
		"fieldtype": "Select",
		"options": "Unclassified\nQualifying\nNon-Qualifying",
		"default": "Unclassified",
		"insert_after": "uae_related_party",
		"description": "QFZP only. Unclassified is treated as non-qualifying for de minimis and tax.",
	},
]

CUSTOM_FIELDS = {
	"Sales Invoice": INVOICE_CT_FIELDS,
	"Purchase Invoice": [
		field for field in INVOICE_CT_FIELDS if field["fieldname"] != "uae_ct_income_class"
	]
	+ [
		{
			"fieldname": "uae_ct_income_class",
			"label": "CT Income Class",
			"fieldtype": "Select",
			"options": "Unclassified\nQualifying\nNon-Qualifying",
			"default": "Unclassified",
			"insert_after": "uae_related_party",
			"hidden": 1,
			"description": "Purchases are not QFZP qualifying income.",
		}
	],
}
