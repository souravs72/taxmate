"""TaxMate-owned custom fields for UAE VAT / e-invoicing.

Do NOT redefine ERPNext UAE regional fields (emirate, tax_code, is_zero_rated,
is_exempt, vat_emirate, company_trn, reverse_charge, permit_no, etc.).
"""

from __future__ import annotations

from taxmate.uae_e_invoicing.constants import (
	BILLING_FREQUENCY_SELECT_OPTIONS,
	PAYMENT_MEANS_SELECT_OPTIONS,
)

PARTY_LEGAL_FIELDS = [
	{
		"fieldname": "uae_legal_section",
		"label": "UAE Legal Identifiers",
		"fieldtype": "Section Break",
		"insert_after": "tax_id",
		"collapsible": 1,
	},
	{
		"fieldname": "trade_license_number",
		"label": "Trade License Number",
		"fieldtype": "Data",
		"insert_after": "uae_legal_section",
		"translatable": 0,
	},
	{
		"fieldname": "legal_registration_identifier_type",
		"label": "Legal Registration Identifier Type",
		"fieldtype": "Select",
		"options": "\nCRN\nOTH",
		"insert_after": "trade_license_number",
		"translatable": 0,
	},
	{
		"fieldname": "legal_registration_identifier",
		"label": "Legal Registration Identifier",
		"fieldtype": "Data",
		"insert_after": "legal_registration_identifier_type",
		"translatable": 0,
	},
	{
		"fieldname": "uae_peppol_id",
		"label": "Peppol Participant ID",
		"fieldtype": "Data",
		"insert_after": "legal_registration_identifier",
		"description": "Peppol endpoint identifier used for e-invoice exchange",
		"translatable": 0,
	},
	{
		"fieldname": "uae_fz_beneficiary_id",
		"label": "FZ Beneficiary ID",
		"fieldtype": "Data",
		"insert_after": "uae_peppol_id",
		"description": "BTAE-01: mandatory for Free Trade Zone transactions",
		"translatable": 0,
	},
]

INVOICE_E_INVOICE_FIELDS = [
	{
		"fieldname": "uae_e_invoice_section",
		"label": "UAE E-Invoicing",
		"fieldtype": "Section Break",
		"insert_after": "tourist_tax_return",
		"collapsible": 1,
	},
	{
		"fieldname": "uae_document_type_code",
		"label": "UAE Document Type Code",
		"fieldtype": "Select",
		"options": "\n380\n381\n480\n81",
		"insert_after": "uae_e_invoice_section",
		"description": (
			"UNCL 1001: 380=Commercial Invoice, 381=Credit Note, "
			"480=Out of Scope Invoice, 81=Out of Scope Credit Note. "
			"Leave blank to derive automatically."
		),
		"translatable": 0,
	},
	{
		"fieldname": "uae_transaction_type_code",
		"label": "UAE Transaction Type Code",
		"fieldtype": "Data",
		"default": "00000000",
		"insert_after": "uae_document_type_code",
		"description": (
			"BTAE-02: 8-digit flag string — positions: 1 Free Trade Zone, 2 Deemed supply, "
			"3 Margin scheme, 4 Summary invoice, 5 Continuous supply, "
			"6 Disclosed agent billing, 7 E-commerce, 8 Export"
		),
		"translatable": 0,
	},
	{
		"fieldname": "uae_billing_frequency",
		"label": "Billing Frequency",
		"fieldtype": "Select",
		"options": BILLING_FREQUENCY_SELECT_OPTIONS,
		"insert_after": "uae_transaction_type_code",
		"description": (
			"IBG-14 InvoicePeriod description code. Required for Summary / Continuous Supply "
			"transactions (transaction type flags)."
		),
		"translatable": 0,
	},
	{
		"fieldname": "uae_payment_means_code",
		"label": "UAE Payment Means",
		"fieldtype": "Select",
		"options": PAYMENT_MEANS_SELECT_OPTIONS,
		"default": "30 - Credit transfer",
		"insert_after": "uae_billing_frequency",
		"description": "IBT-081 (UNCL 4461). POS payments use the Mode of Payment code instead.",
		"depends_on": "eval:!doc.is_return",
		"translatable": 0,
	},
	{
		"fieldname": "uae_credit_note_reason",
		"label": "UAE Credit Note Reason",
		"fieldtype": "Small Text",
		"insert_after": "uae_payment_means_code",
		"depends_on": "eval:doc.is_return",
		"mandatory_depends_on": "eval:doc.is_return",
	},
	{
		"fieldname": "uae_return_against_external",
		"label": "External Return Against",
		"fieldtype": "Data",
		"insert_after": "uae_credit_note_reason",
		"depends_on": "eval:doc.is_return && !doc.return_against",
		"description": (
			"IBT-025: number of the original invoice when it was issued outside "
			"this system (pre-go-live or another ERP)"
		),
		"no_copy": 1,
		"translatable": 0,
	},
	{
		"fieldname": "uae_e_invoice_column",
		"fieldtype": "Column Break",
		"insert_after": "uae_return_against_external",
	},
	{
		"fieldname": "uae_e_invoice_status",
		"label": "UAE E-Invoice Status",
		"fieldtype": "Select",
		"options": "\nDraft\nGenerated\nQueued\nSubmitted\nAccepted\nRejected\nFailed\nCancelled",
		"insert_after": "uae_e_invoice_column",
		"read_only": 1,
		"allow_on_submit": 1,
		"no_copy": 1,
		"in_standard_filter": 1,
		"translatable": 0,
	},
	{
		"fieldname": "uae_e_invoice_log",
		"label": "UAE E-Invoice Log",
		"fieldtype": "Link",
		"options": "UAE E-Invoice Log",
		"insert_after": "uae_e_invoice_status",
		"read_only": 1,
		"allow_on_submit": 1,
		"no_copy": 1,
	},
]

PURCHASE_INVOICE_E_INVOICE_FIELDS = [
	{
		"fieldname": "uae_e_invoice_section",
		"label": "UAE E-Invoicing (Self-Billed)",
		"fieldtype": "Section Break",
		"insert_after": "recoverable_reverse_charge",
		"collapsible": 1,
	},
	{
		"fieldname": "uae_submit_to_fta",
		"label": "Submit as Self-Billed E-Invoice",
		"fieldtype": "Check",
		"insert_after": "uae_e_invoice_section",
		"description": "Generate a self-billed e-invoice (389/361) for this purchase",
		"default": "0",
	},
	{
		"fieldname": "uae_document_type_code",
		"label": "UAE Document Type Code",
		"fieldtype": "Select",
		"options": "\n389\n361",
		"insert_after": "uae_submit_to_fta",
		"description": "UNCL 1001: 389=Self-Billed Invoice, 361=Self-Billed Credit Note. Leave blank to derive.",
		"depends_on": "uae_submit_to_fta",
		"translatable": 0,
	},
	{
		"fieldname": "uae_payment_means_code",
		"label": "UAE Payment Means",
		"fieldtype": "Select",
		"options": PAYMENT_MEANS_SELECT_OPTIONS,
		"default": "30 - Credit transfer",
		"insert_after": "uae_document_type_code",
		"depends_on": "uae_submit_to_fta",
		"translatable": 0,
	},
	{
		"fieldname": "uae_e_invoice_column",
		"fieldtype": "Column Break",
		"insert_after": "uae_payment_means_code",
	},
	{
		"fieldname": "uae_e_invoice_status",
		"label": "UAE E-Invoice Status",
		"fieldtype": "Select",
		"options": "\nDraft\nGenerated\nQueued\nSubmitted\nAccepted\nRejected\nFailed\nCancelled",
		"insert_after": "uae_e_invoice_column",
		"read_only": 1,
		"allow_on_submit": 1,
		"no_copy": 1,
		"in_standard_filter": 1,
		"translatable": 0,
	},
	{
		"fieldname": "uae_e_invoice_log",
		"label": "UAE E-Invoice Log",
		"fieldtype": "Link",
		"options": "UAE E-Invoice Log",
		"insert_after": "uae_e_invoice_status",
		"read_only": 1,
		"allow_on_submit": 1,
		"no_copy": 1,
	},
]

INVOICE_ITEM_FIELDS = [
	{
		"fieldname": "uae_item_type",
		"label": "UAE Item Type",
		"fieldtype": "Select",
		"options": "\nGoods\nService\nBoth",
		"insert_after": "item_code",
		"fetch_from": "item_code.uae_item_type",
		"fetch_if_empty": 1,
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "hs_code",
		"label": "HS Code",
		"fieldtype": "Data",
		"insert_after": "uae_item_type",
		"fetch_from": "item_code.hs_code",
		"fetch_if_empty": 1,
		"depends_on": "eval:in_list(['Goods','Both'], doc.uae_item_type)",
		"print_hide": 1,
		"translatable": 0,
	},
	{
		"fieldname": "sac_code",
		"label": "SAC Code",
		"fieldtype": "Data",
		"insert_after": "hs_code",
		"fetch_from": "item_code.sac_code",
		"fetch_if_empty": 1,
		"depends_on": "eval:in_list(['Service','Both'], doc.uae_item_type)",
		"print_hide": 1,
		"translatable": 0,
	},
]

CUSTOM_FIELDS = {
	"Company": [
		{
			"fieldname": "uae_e_invoicing_section",
			"label": "UAE E-Invoicing",
			"fieldtype": "Section Break",
			"insert_after": "tax_id",
			"collapsible": 1,
		},
		{
			"fieldname": "uae_e_invoice_enabled",
			"label": "Enable UAE E-Invoicing",
			"fieldtype": "Check",
			"insert_after": "uae_e_invoicing_section",
			"default": "0",
		},
		{
			"fieldname": "trade_license_number",
			"label": "Trade License Number",
			"fieldtype": "Data",
			"insert_after": "uae_e_invoice_enabled",
			"translatable": 0,
		},
		{
			"fieldname": "legal_registration_identifier_type",
			"label": "Legal Registration Identifier Type",
			"fieldtype": "Select",
			"options": "\nCRN\nOTH",
			"insert_after": "trade_license_number",
			"translatable": 0,
		},
		{
			"fieldname": "legal_registration_identifier",
			"label": "Legal Registration Identifier",
			"fieldtype": "Data",
			"insert_after": "legal_registration_identifier_type",
			"translatable": 0,
		},
		{
			"fieldname": "uae_peppol_id",
			"label": "Peppol Participant ID",
			"fieldtype": "Data",
			"insert_after": "legal_registration_identifier",
			"description": "Company's Peppol endpoint identifier registered with the ASP",
			"translatable": 0,
		},
		{
			"fieldname": "uae_fz_beneficiary_id",
			"label": "FZ Beneficiary ID",
			"fieldtype": "Data",
			"insert_after": "uae_peppol_id",
			"description": "BTAE-01: Free Zone beneficiary identifier for the seller company",
			"translatable": 0,
		},
	],
	"Customer": PARTY_LEGAL_FIELDS,
	"Supplier": PARTY_LEGAL_FIELDS,
	"Item": [
		{
			"fieldname": "uae_classification_section",
			"label": "UAE Classification",
			"fieldtype": "Section Break",
			"insert_after": "is_exempt",
			"collapsible": 1,
		},
		{
			"fieldname": "uae_item_type",
			"label": "UAE Item Type",
			"fieldtype": "Select",
			"options": "\nGoods\nService\nBoth",
			"insert_after": "uae_classification_section",
			"translatable": 0,
		},
		{
			"fieldname": "hs_code",
			"label": "HS Code",
			"fieldtype": "Data",
			"insert_after": "uae_item_type",
			"depends_on": "eval:in_list(['Goods','Both'], doc.uae_item_type)",
			"translatable": 0,
		},
		{
			"fieldname": "sac_code",
			"label": "SAC Code",
			"fieldtype": "Data",
			"insert_after": "hs_code",
			"depends_on": "eval:in_list(['Service','Both'], doc.uae_item_type)",
			"translatable": 0,
		},
	],
	"Item Tax Template": [
		{
			"fieldname": "uae_vat_section",
			"label": "UAE VAT",
			"fieldtype": "Section Break",
			"insert_after": "taxes",
			"collapsible": 1,
		},
		{
			"fieldname": "uae_vat_category",
			"label": "UAE VAT Category",
			"fieldtype": "Select",
			"options": "\nStandard\nZero Rated\nExempt\nOut of Scope\nReverse Charge\nMargin Scheme",
			"insert_after": "uae_vat_section",
			"translatable": 0,
		},
		{
			"fieldname": "uae_exemption_reason",
			"label": "UAE Exemption Reason",
			"fieldtype": "Small Text",
			"insert_after": "uae_vat_category",
			"depends_on": "eval:in_list(['Zero Rated','Exempt','Out of Scope'], doc.uae_vat_category)",
		},
		{
			"fieldname": "uae_rcm_nature",
			"label": "UAE RCM Nature",
			"fieldtype": "Data",
			"insert_after": "uae_exemption_reason",
			"depends_on": "eval:doc.uae_vat_category=='Reverse Charge'",
			"translatable": 0,
		},
	],
	"Mode of Payment": [
		{
			"fieldname": "uae_payment_means_code",
			"label": "UAE Payment Means Code",
			"fieldtype": "Select",
			"options": PAYMENT_MEANS_SELECT_OPTIONS,
			"insert_after": "type",
			"description": "UNCL 4461 payment means used on UAE e-invoices (IBT-081)",
			"translatable": 0,
		},
	],
	"Sales Invoice": INVOICE_E_INVOICE_FIELDS,
	"Purchase Invoice": PURCHASE_INVOICE_E_INVOICE_FIELDS,
	"Sales Invoice Item": INVOICE_ITEM_FIELDS,
	"Purchase Invoice Item": INVOICE_ITEM_FIELDS,
}
