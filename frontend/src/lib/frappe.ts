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
  paymentEntry: "Payment Entry",
  supplier: "Supplier",
  purchaseInvoice: "Purchase Invoice",
  paymentEntryRef: "Payment Entry Reference",
  modeOfPayment: "Mode of Payment",
  taxTemplate: "Sales Taxes and Charges Template",
  paymentTerms: "Payment Terms Template",
  sellingSettings: "Selling Settings",
  itemGroup: "Item Group",
  customerGroup: "Customer Group",
  uom: "UOM",
  eInvoiceLog: "UAE E-Invoice Log",
} as const;

/**
 * RPC names from taxmate.api.get_catalog() where available.
 * Prefer taxmate.api.* over raw erpnext.* / frappe.desk.*.
 */
export const METHOD = {
  getCatalog: "taxmate.api.get_catalog",
  getSession: "taxmate.api.get_session",
  getHome: "taxmate.api.dashboard.get_home",
  getDefaults: "taxmate.api.accounts.get_defaults",
  getPartyDetails: "taxmate.api.accounts.get_party_details",
  partyDetails: "taxmate.api.accounts.get_party_details",
  getItemDetails: "taxmate.api.accounts.get_item_details",
  itemDetails: "taxmate.api.accounts.get_item_details",
  getOutstandingInvoices: "taxmate.api.accounts.get_outstanding_invoices",
  /**
   * Both legs of a Payment Entry from the Mode of Payment and the party.
   *
   * The Payment Entry controller never reads mode_of_payment: paid_from and
   * paid_to are mandatory and nothing server-side fills them, so they have to
   * be resolved and sent. ERPNext's own helper does it without a permission
   * check and accepts any company, so TaxMate wraps it -- and the
   * Receive -> paid_to / Pay -> paid_from mapping lives on the server rather
   * than in the browser.
   */
  resolvePaymentAccounts: "taxmate.api.accounts.resolve_payment_accounts",
  getPaymentEntry: "taxmate.api.accounts.get_payment_entry",
  makeSalesReturn: "taxmate.api.accounts.make_sales_return",
  submit: "taxmate.api.workflow.submit",
  cancel: "taxmate.api.workflow.cancel",
  amend: "taxmate.api.workflow.amend",
  searchLink: "taxmate.api.resource.search_link",
  runReport: "taxmate.api.reports.run_report",
  fulfilmentSummary: "taxmate.api.sales_order.fulfilment_summary",
  /** Child doctypes cannot be listed directly — this filters the parents. */
  salesOrderLinks: "taxmate.api.sales_order.linked_documents",
  awesomeSearch: "taxmate.api.search.awesome",
  generateEInvoice: "taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice",
  bulkGenerateEInvoices: "taxmate.uae_e_invoicing.utils.e_invoice.bulk_generate_e_invoices",
  syncEInvoiceStatus: "taxmate.uae_e_invoicing.utils.e_invoice.sync_status_from_asp",
  fetchEInvoiceDocuments: "taxmate.uae_e_invoicing.utils.e_invoice.fetch_asp_documents",
  /**
   * Aggregates. frappe.client.get_list is whitelisted (frappe/client.py:26)
   * and its signature explicitly accepts dict fields —
   * `fields: str | list[str | dict]` — which DatabaseQuery turns into SQL
   * functions (frappe/database/query.py:1163, FUNCTION_MAPPING at :179).
   * Frappe's own list view uses the same shape in get_group_by_count. No
   * custom aggregation endpoint needed.
   */
  clientGetList: "frappe.client.get_list",
  /** Count with an or_filters group, which the SDK's own count hook lacks. */
  reportviewCount: "frappe.desk.reportview.get_count",
  /** Activity timeline: comments, versions, assignments. */
  getDocinfo: "frappe.desk.form.load.get_docinfo",
  /**
   * Mappers return an unsaved doc — the caller inserts it.
   *
   * These go through TaxMate, not ERPNext's own whitelisted mappers. The
   * ERPNext signatures accept `target_doc` and (for the invoice)
   * `ignore_permissions` straight off the wire; the TaxMate wrappers take only
   * the source name and fix those arguments server-side.
   */
  makeDeliveryNote: "taxmate.api.sales_order.make_delivery_note",
  makeSalesInvoice: "taxmate.api.sales_order.make_sales_invoice",
  /** Stage donut — until a TaxMate wrapper exists. */
  groupByCount: "frappe.desk.listview.get_group_by_count",
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
