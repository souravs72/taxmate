// TaxMate custom fields on ERPNext DocTypes — generated. Do not edit by hand.


/**
 * Custom fields TaxMate adds to ERPNext's `Company`.
 * Generated from the app source — do not edit by hand.
 */
export interface CompanyCustomFields {
  /** Enable UAE E-Invoicing */
  uae_e_invoice_enabled?: 0 | 1;
  /** Trade License Number */
  trade_license_number?: string;
  /** Legal Registration Identifier Type */
  legal_registration_identifier_type?: "CRN" | "OTH";
  /** Legal Registration Identifier */
  legal_registration_identifier?: string;
  /** Peppol Participant ID */
  uae_peppol_id?: string;
  /** FZ Beneficiary ID */
  uae_fz_beneficiary_id?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Customer`.
 * Generated from the app source — do not edit by hand.
 */
export interface CustomerCustomFields {
  /** Trade License Number */
  trade_license_number?: string;
  /** Legal Registration Identifier Type */
  legal_registration_identifier_type?: "CRN" | "OTH";
  /** Legal Registration Identifier */
  legal_registration_identifier?: string;
  /** Peppol Participant ID */
  uae_peppol_id?: string;
  /** FZ Beneficiary ID */
  uae_fz_beneficiary_id?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Supplier`.
 * Generated from the app source — do not edit by hand.
 */
export interface SupplierCustomFields {
  /** Trade License Number */
  trade_license_number?: string;
  /** Legal Registration Identifier Type */
  legal_registration_identifier_type?: "CRN" | "OTH";
  /** Legal Registration Identifier */
  legal_registration_identifier?: string;
  /** Peppol Participant ID */
  uae_peppol_id?: string;
  /** FZ Beneficiary ID */
  uae_fz_beneficiary_id?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Item`.
 * Generated from the app source — do not edit by hand.
 */
export interface ItemCustomFields {
  /** UAE Item Type */
  uae_item_type?: "Goods" | "Service" | "Both";
  /** HS Code */
  hs_code?: string;
  /** SAC Code */
  sac_code?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Item Tax Template`.
 * Generated from the app source — do not edit by hand.
 */
export interface ItemTaxTemplateCustomFields {
  /** UAE VAT Category */
  uae_vat_category?: "Standard" | "Zero Rated" | "Exempt" | "Out of Scope" | "Reverse Charge" | "Margin Scheme";
  /** UAE Exemption Reason */
  uae_exemption_reason?: string;
  /** UAE RCM Nature */
  uae_rcm_nature?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Mode of Payment`.
 * Generated from the app source — do not edit by hand.
 */
export interface ModeOfPaymentCustomFields {
  /** UAE Payment Means Code */
  uae_payment_means_code?: "1 - Instrument not defined" | "10 - Cash" | "20 - Cheque" | "30 - Credit transfer" | "31 - Debit transfer" | "42 - Payment to bank account" | "48 - Bank card" | "49 - Direct debit" | "54 - Credit card" | "55 - Debit card" | "58 - SEPA credit transfer";
}

/**
 * Custom fields TaxMate adds to ERPNext's `Sales Invoice`.
 * Generated from the app source — do not edit by hand.
 */
export interface SalesInvoiceCustomFields {
  /** UAE Document Type Code */
  uae_document_type_code?: "380" | "381" | "480" | "81";
  /** UAE Transaction Type Code */
  uae_transaction_type_code?: string;
  /** Billing Frequency */
  uae_billing_frequency?: "DLY" | "WKY" | "Q15" | "MTH" | "Q45" | "Q60" | "QTR" | "HYR" | "YRL" | "OTH";
  /** UAE Payment Means */
  uae_payment_means_code?: "1 - Instrument not defined" | "10 - Cash" | "20 - Cheque" | "30 - Credit transfer" | "31 - Debit transfer" | "42 - Payment to bank account" | "48 - Bank card" | "49 - Direct debit" | "54 - Credit card" | "55 - Debit card" | "58 - SEPA credit transfer";
  /** UAE Credit Note Reason */
  uae_credit_note_reason?: string;
  /** External Return Against */
  uae_return_against_external?: string;
  /** UAE E-Invoice Status (read-only) */
  uae_e_invoice_status?: "Draft" | "Generated" | "Queued" | "Submitted" | "Accepted" | "Rejected" | "Failed" | "Cancelled";
  /** UAE E-Invoice Log → UAE E-Invoice Log (read-only) */
  uae_e_invoice_log?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Purchase Invoice`.
 * Generated from the app source — do not edit by hand.
 */
export interface PurchaseInvoiceCustomFields {
  /** Submit as Self-Billed E-Invoice */
  uae_submit_to_fta?: 0 | 1;
  /** UAE Document Type Code */
  uae_document_type_code?: "389" | "361";
  /** UAE Payment Means */
  uae_payment_means_code?: "1 - Instrument not defined" | "10 - Cash" | "20 - Cheque" | "30 - Credit transfer" | "31 - Debit transfer" | "42 - Payment to bank account" | "48 - Bank card" | "49 - Direct debit" | "54 - Credit card" | "55 - Debit card" | "58 - SEPA credit transfer";
  /** UAE E-Invoice Status (read-only) */
  uae_e_invoice_status?: "Draft" | "Generated" | "Queued" | "Submitted" | "Accepted" | "Rejected" | "Failed" | "Cancelled";
  /** UAE E-Invoice Log → UAE E-Invoice Log (read-only) */
  uae_e_invoice_log?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Sales Invoice Item`.
 * Generated from the app source — do not edit by hand.
 */
export interface SalesInvoiceItemCustomFields {
  /** UAE Item Type */
  uae_item_type?: "Goods" | "Service" | "Both";
  /** HS Code */
  hs_code?: string;
  /** SAC Code */
  sac_code?: string;
}

/**
 * Custom fields TaxMate adds to ERPNext's `Purchase Invoice Item`.
 * Generated from the app source — do not edit by hand.
 */
export interface PurchaseInvoiceItemCustomFields {
  /** UAE Item Type */
  uae_item_type?: "Goods" | "Service" | "Both";
  /** HS Code */
  hs_code?: string;
  /** SAC Code */
  sac_code?: string;
}
