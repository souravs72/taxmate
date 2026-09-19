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
  customer: "Customer",
  item: "Item",
  address: "Address",
  deliveryNote: "Delivery Note",
  deliveryNoteItem: "Delivery Note Item",
  salesInvoice: "Sales Invoice",
  salesInvoiceItem: "Sales Invoice Item",
  paymentEntryRef: "Payment Entry Reference",
} as const;

/* ── Whitelisted methods, verified against ERPNext v16 source ─────────── */
export const METHOD = {
  /** erpnext/accounts/party.py:77 — pass doctype so the right branch runs */
  partyDetails: "erpnext.accounts.party.get_party_details",
  /** erpnext/stock/get_item_details.py:85 — takes a ctx dict, not flat kwargs */
  itemDetails: "erpnext.stock.get_item_details.get_item_details",
  /** sales_order.py:1172 — returns an UNSAVED doc; caller must insert */
  makeDeliveryNote: "erpnext.selling.doctype.sales_order.sales_order.make_delivery_note",
  /** sales_order.py:1356 — returns an UNSAVED doc; caller must insert */
  makeSalesInvoice: "erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice",
  /** frappe/desk/form/load.py:92 — timeline, comments, attachments */
  docinfo: "frappe.desk.form.load.get_docinfo",
  /** frappe/desk/listview.py:34 — [{name, count}], used for the stage donut */
  groupByCount: "frappe.desk.listview.get_group_by_count",
  /** frappe/desk/reportview.py:30 — group_by + aggregate_function (one column per call) */
  reportview: "frappe.desk.reportview.get",
  /** Backend track — see claude/build-plan-decisions.md. Frontend degrades if absent. */
  fulfilmentSummary: "taxmate.api.sales_order.fulfilment_summary",
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
