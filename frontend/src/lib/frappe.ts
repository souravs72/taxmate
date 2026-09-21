/**
 * Thin typed wrappers over frappe-react-sdk.
 *
 * Two rules this file enforces:
 *  1. The site name and CSRF token come from the server (injected by
 *     taxmate/www/taxmate.py), never from a constant in the bundle.
 *  2. Everything is same-origin, so no base URL is configured anywhere.
 */

declare global {
  interface Window {
    csrf_token?: string;
    site_name?: string;
    taxmate_boot?: { user?: string; socket_port?: string };
  }
}

/** Site name as rendered by the server. Empty in `npm run dev` against a proxy. */
export function getSiteName(): string | undefined {
  const s = window.site_name;
  // Unsubstituted Jinja means the page was served statically — treat as absent.
  if (!s || s.startsWith("{{")) return undefined;
  return s;
}

export function getSocketPort(): string | undefined {
  const p = window.taxmate_boot?.socket_port;
  if (!p || p.startsWith("{{")) return undefined;
  return p;
}

/**
 * True when the page was rendered by Frappe and carries a live CSRF token.
 * frappe-js-sdk skips the header when the value is the literal placeholder,
 * so a static serve fails loudly on the first write instead of silently.
 */
export function hasCsrfToken(): boolean {
  const t = window.csrf_token;
  return !!t && !t.startsWith("{{");
}

/* ── Doctype names in one place, so a rename is one edit ─────────────── */
export const DT = {
  salesOrder: "Sales Order",
  salesOrderItem: "Sales Order Item",
  salesInvoice: "Sales Invoice",
  salesInvoiceItem: "Sales Invoice Item",
  deliveryNote: "Delivery Note",
  deliveryNoteItem: "Delivery Note Item",
  customer: "Customer",
  item: "Item",
  itemPrice: "Item Price",
  address: "Address",
  contact: "Contact",
  account: "Account",
  journalEntry: "Journal Entry",
  costCenter: "Cost Center",
  paymentEntry: "Payment Entry",
  supplier: "Supplier",
  purchaseInvoice: "Purchase Invoice",
  purchaseOrder: "Purchase Order",
  purchaseReceipt: "Purchase Receipt",
  incomingInvoice: "UAE Incoming Invoice",
  paymentEntryRef: "Payment Entry Reference",
  modeOfPayment: "Mode of Payment",
  taxTemplate: "Sales Taxes and Charges Template",
  purchaseTaxTemplate: "Purchase Taxes and Charges Template",
  warehouse: "Warehouse",
  paymentTerms: "Payment Terms Template",
  sellingSettings: "Selling Settings",
  buyingSettings: "Buying Settings",
  itemGroup: "Item Group",
  customerGroup: "Customer Group",
  supplierGroup: "Supplier Group",
  uom: "UOM",
  eInvoiceLog: "UAE E-Invoice Log",
  vat201: "UAE VAT 201 Filing Log",
  ctFiling: "UAE CT Filing Log",
  esrFiling: "UAE ESR Filing",
  uboRegister: "UAE UBO Register",
  lateFiling: "UAE Late Filing Notice",
} as const;

/**
 * RPC names from taxmate.api.get_catalog() where available.
 * Prefer taxmate.api.* over raw erpnext.* / frappe.desk.*.
 */
export const METHOD = {
  getCatalog: "taxmate.api.get_catalog",
  getSession: "taxmate.api.get_session",
  getHome: "taxmate.api.dashboard.get_home",
  getList: "taxmate.api.resource.get_list",
  get: "taxmate.api.resource.get",
  insert: "taxmate.api.resource.insert",
  save: "taxmate.api.resource.save",
  delete: "taxmate.api.resource.delete",
  getCount: "taxmate.api.resource.get_count",
  groupByCount: "taxmate.api.resource.group_by_count",
  getDefaults: "taxmate.api.accounts.get_defaults",
  getPartyDetails: "taxmate.api.accounts.get_party_details",
  partyDetails: "taxmate.api.accounts.get_party_details",
  getItemDetails: "taxmate.api.accounts.get_item_details",
  itemDetails: "taxmate.api.accounts.get_item_details",
  getOutstandingInvoices: "taxmate.api.accounts.get_outstanding_invoices",
  resolvePaymentAccounts: "taxmate.api.accounts.resolve_payment_accounts",
  getPaymentEntry: "taxmate.api.accounts.get_payment_entry",
  getAccountTree: "taxmate.api.accounts.get_account_tree",
  makeSalesReturn: "taxmate.api.accounts.make_sales_return",
  submit: "taxmate.api.workflow.submit",
  cancel: "taxmate.api.workflow.cancel",
  amend: "taxmate.api.workflow.amend",
  searchLink: "taxmate.api.resource.search_link",
  runReport: "taxmate.api.reports.run_report",
  listReports: "taxmate.api.reports.list_reports",
  fulfilmentSummary: "taxmate.api.sales_order.fulfilment_summary",
  salesOrderLinks: "taxmate.api.sales_order.linked_documents",
  draftPurchaseInvoiceFromIncoming: "taxmate.uae_e_invoicing.doctype.uae_incoming_invoice.uae_incoming_invoice.create_purchase_invoice",
  makeDeliveryNote: "taxmate.api.sales_order.make_delivery_note",
  makeSalesInvoice: "taxmate.api.sales_order.make_sales_invoice",
  makePurchaseReceipt: "taxmate.api.purchase_order.make_purchase_receipt",
  makePurchaseInvoice: "taxmate.api.purchase_order.make_purchase_invoice",
  awesomeSearch: "taxmate.api.search.awesome",
  generateEInvoice: "taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice",
  bulkGenerateEInvoices: "taxmate.uae_e_invoicing.utils.e_invoice.bulk_generate_e_invoices",
  syncEInvoiceStatus: "taxmate.uae_e_invoicing.utils.e_invoice.sync_status_from_asp",
  fetchEInvoiceDocuments: "taxmate.uae_e_invoicing.utils.e_invoice.fetch_asp_documents",
  getOrCreateVat201: "taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.get_or_create",
  generateVat201: "taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.generate_filing",
  listUsers: "taxmate.api.users.list_users",
  inviteUser: "taxmate.api.users.invite_user",
  setUserRole: "taxmate.api.users.set_user_role",
  setUserEnabled: "taxmate.api.users.set_user_enabled",
} as const;

/** Frappe error payloads are HTML and often several messages joined by <br>. */
export function readableError(err: unknown): string[] {
  const e = err as { message?: string; exception?: string; _server_messages?: string };
  let raw = "";
  if (e?._server_messages) {
    try {
      raw = (JSON.parse(e._server_messages) as string[])
        .map((m) => {
          try {
            return (JSON.parse(m) as { message?: string }).message ?? m;
          } catch {
            return m;
          }
        })
        .join("<br>");
    } catch {
      raw = e._server_messages;
    }
  }
  raw = raw || e?.message || e?.exception || "Something went wrong.";
  return raw
    .split(/<br\s*\/?>/i)
    .map((s) => s.replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
}
