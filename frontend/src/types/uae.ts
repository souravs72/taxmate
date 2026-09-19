// UAE / PINT-AE code lists — generated from taxmate constants. Do not edit by hand.


export const E_INVOICE_STATUSES = ["Draft", "Generated", "Queued", "Submitted", "Accepted", "Rejected", "Failed", "Cancelled"] as const;

export type EInvoiceStatus = (typeof E_INVOICE_STATUSES)[number];


export const SALES_DOCUMENT_TYPE_CODES = {
  "380": "Commercial Invoice",
  "381": "Credit Note (Taxable)",
  "480": "Out of Scope Invoice",
  "81": "Credit Note (Out of Scope)"
} as const;

export const PURCHASE_DOCUMENT_TYPE_CODES = {
  "389": "Self-Billed Invoice",
  "361": "Self-Billed Credit Note"
} as const;

export const VAT_CATEGORY_CODES = {
  "Standard": "S",
  "Zero Rated": "Z",
  "Exempt": "E",
  "Out of Scope": "O",
  "Reverse Charge": "AE",
  "Margin Scheme": "N"
} as const;

export const APPROVED_PAYMENT_MEANS = {
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
  "58": "SEPA credit transfer"
} as const;

export const EMIRATE_SUBDIVISION_CODES = {
  "Abu Dhabi": "AUH",
  "Ajman": "AJM",
  "Dubai": "DXB",
  "Fujairah": "FUJ",
  "Ras Al Khaimah": "RAK",
  "Sharjah": "SHJ",
  "Umm Al Quwain": "UAQ"
} as const;

export const BILLING_FREQUENCY_CODES = {
  "DLY": "Daily",
  "WKY": "Weekly",
  "Q15": "Every 15 days",
  "MTH": "Monthly",
  "Q45": "Every 45 days",
  "Q60": "Every 60 days",
  "QTR": "Quarterly",
  "HYR": "Half-yearly",
  "YRL": "Yearly",
  "OTH": "Other"
} as const;

export const UAE_EMIRATES = ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"] as const;

export type Emirate = (typeof UAE_EMIRATES)[number];

export const PINT_AE_CUSTOMIZATION_ID = "urn:peppol:pint:billing-1@ae-1";
