"""UAE e-invoicing (PINT-AE) code lists and constants.

References:
- PINT-AE billing specification (docs.peppol.eu/poac/ae)
- FTA eInvoice Data Dictionary / Mandatory Fields (Feb 2026)
- UNCL1001 (document types), UNCL4461 (payment means)
"""

from __future__ import annotations

PINT_AE_CUSTOMIZATION_ID = "urn:peppol:pint:billing-1@ae-1"
PINT_AE_PROFILE_ID = "urn:peppol:bis:billing"

AED_CURRENCY = "AED"

# UNCL1001 document type codes used by the UAE mandate
SALES_DOCUMENT_TYPE_CODES = {
	"380": "Commercial Invoice",
	"381": "Credit Note (Taxable)",
	"480": "Out of Scope Invoice",
	"81": "Credit Note (Out of Scope)",
}

PURCHASE_DOCUMENT_TYPE_CODES = {
	"389": "Self-Billed Invoice",
	"361": "Self-Billed Credit Note",
}

# PEPPOL / PINT-AE VAT category codes, keyed by the labels used on
# Item Tax Template.uae_vat_category
VAT_CATEGORY_CODES = {
	"Standard": "S",
	"Zero Rated": "Z",
	"Exempt": "E",
	"Out of Scope": "O",
	"Reverse Charge": "AE",
	"Margin Scheme": "N",
}

# UNCL4461 subset approved for UAE e-invoicing (IBT-081)
APPROVED_PAYMENT_MEANS = {
	"1": "Instrument not defined",
	"10": "Cash",
	"20": "Cheque",
	"30": "Credit transfer",
	"31": "Debit transfer",
	"42": "Payment to bank account",
	"48": "Bank card",
	"49": "Direct debit",
	"54": "Credit card",
	"55": "Debit card",
	"58": "SEPA credit transfer",
}

PAYMENT_MEANS_SELECT_OPTIONS = "\n" + "\n".join(
	f"{code} - {label}" for code, label in APPROVED_PAYMENT_MEANS.items()
)

# Codes that require payee financial account details (IBT-084)
BANK_TRANSFER_PAYMENT_CODES = ("30", "58")
CARD_PAYMENT_CODES = ("48", "54", "55")

# PEPPOL country-subdivision codes for the seven emirates (IBT-054)
EMIRATE_SUBDIVISION_CODES = {
	"Abu Dhabi": "AUH",
	"Ajman": "AJM",
	"Dubai": "DXB",
	"Fujairah": "FUJ",
	"Ras Al Khaimah": "RAK",
	"Sharjah": "SHJ",
	"Umm Al Quwain": "UAQ",
}

# BTAE-02: 8-character bit-flag string describing UAE special transaction types.
# Position (0-based) -> meaning when set to "1".
TRANSACTION_TYPE_FLAGS = (
	"free_trade_zone",  # 0
	"deemed_supply",  # 1
	"margin_scheme",  # 2
	"summary_invoice",  # 3
	"continuous_supply",  # 4
	"disclosed_agent_billing",  # 5
	"e_commerce",  # 6
	"export",  # 7
)

DEFAULT_TRANSACTION_TYPE_CODE = "00000000"

# IBG-14 / InvoicePeriod description codes (frequency of billing)
BILLING_FREQUENCY_CODES = {
	"DLY": "Daily",
	"WKY": "Weekly",
	"Q15": "Every 15 days",
	"MTH": "Monthly",
	"Q45": "Every 45 days",
	"Q60": "Every 60 days",
	"QTR": "Quarterly",
	"HYR": "Half-yearly",
	"YRL": "Yearly",
	"OTH": "Other",
}

BILLING_FREQUENCY_SELECT_OPTIONS = "\n" + "\n".join(BILLING_FREQUENCY_CODES.keys())

# Item classification used for HS / SAC enforcement
ITEM_TYPE_GOODS = "Goods"
ITEM_TYPE_SERVICE = "Service"
ITEM_TYPE_BOTH = "Both"

# E-invoice lifecycle statuses shared by log + invoice custom field
E_INVOICE_STATUSES = (
	"Draft",
	"Generated",
	"Queued",
	"Submitted",
	"Accepted",
	"Rejected",
	"Failed",
	"Cancelled",
)

# FTA transmission window: issue/submit → Accepted (calendar days)
TRANSMISSION_SLA_DAYS = 14

# Signed XML/PDF archive — keep accepted logs at least this long
ARCHIVE_RETENTION_YEARS = 5

# Contingency: report ASP/FTA downtime within this many days
CONTINGENCY_REPORT_DAYS = 2
