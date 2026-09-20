/**
 * Status mapping — ERPNext's nine Sales Order statuses down to the four the
 * UI shows. Confirmed with Priti, 19 Sep.
 *
 * Both vocabularies stay live: Desk keeps showing the ERPNext status, so the
 * mapping lives here rather than in a custom field on the server.
 *
 * Source of truth for the nine: erpnext/selling/doctype/sales_order/sales_order.json
 */

export const SO_UI_STATUSES = ["Draft", "Open", "Completed", "Cancelled"] as const;
export type SoUiStatus = (typeof SO_UI_STATUSES)[number];

const SO_MAP: Record<string, SoUiStatus> = {
  Draft: "Draft",
  "On Hold": "Open",
  "To Pay": "Open",
  "To Deliver and Bill": "Open",
  "To Bill": "Open",
  "To Deliver": "Open",
  Completed: "Completed",
  Closed: "Completed",
  Cancelled: "Cancelled",
};

/** ERPNext status → the four the UI shows. */
export function toUiStatus(erpStatus?: string): SoUiStatus {
  if (!erpStatus) return "Draft";
  return SO_MAP[erpStatus] ?? "Open";
}

/** The reverse, for building a server-side `["status","in",[...]]` filter. */
export function erpStatusesFor(ui: SoUiStatus): string[] {
  return Object.entries(SO_MAP)
    .filter(([, v]) => v === ui)
    .map(([k]) => k);
}

export const SO_PILL_CLASS: Record<SoUiStatus, string> = {
  Draft: "p-draft",
  Open: "p-open",
  Completed: "p-done",
  Cancelled: "p-cxl",
};

/* ── Fulfilment stage — a separate axis from document status ───────────
   Derived from per_delivered / per_billed, not from `status`. This is what
   the donut shows; the Status column shows the mapping above.            */

export const STAGES = ["draft", "confirmed", "delivered", "billed"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_COLOUR: Record<Stage, string> = {
  draft: "var(--c-draft)",
  confirmed: "var(--c-confirmed)",
  delivered: "var(--c-delivered)",
  billed: "var(--c-billed)",
};

/** Furthest stage an order has reached. Mutually exclusive, so it fits a donut. */
export function stageOf(o: {
  status?: string;
  docstatus?: number;
  per_delivered?: number;
  per_billed?: number;
}): Stage {
  /* Prefer docstatus — insert-with-docstatus:1 can leave status stuck on Draft. */
  if (o.docstatus === 0) return "draft";
  if ((o.per_billed ?? 0) >= 100) return "billed";
  if ((o.per_delivered ?? 0) >= 100) return "delivered";
  return "confirmed";
}

/**
 * Late = still open, past its delivery date, not fully delivered.
 *
 * Derived, not read from `status`. ERPNext writes Sales Invoice "Overdue"
 * from a daily job; the equivalent staleness applies to anything date-driven,
 * so the UI computes it rather than trusting a stored flag.
 */
export function isLate(o: { delivery_date?: string; per_delivered?: number; status?: string }): boolean {
  if (!o.delivery_date) return false;
  if (toUiStatus(o.status) !== "Open") return false;
  if ((o.per_delivered ?? 0) >= 100) return false;
  const due = new Date(o.delivery_date + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/* ── Sales Invoice — spec §5.2 ───────────────────────────────────────── */

export const INV_UI_STATUSES =
  ["Draft", "Unpaid", "Part", "Overdue", "Paid", "Return", "Cancelled"] as const;
export type InvUiStatus = (typeof INV_UI_STATUSES)[number];

export type InvoiceRow = {
  docstatus?: number;
  status?: string;
  is_return?: number;
  due_date?: string;
  outstanding_amount?: number;
};

/** ERPNext's own overdue statuses, for the union below. */
export const ERP_OVERDUE = ["Overdue", "Overdue and Discounted"];

/**
 * "Today" as the SITE sees it. taxmate.api.get_session returns the server's
 * date; a browser in another timezone would otherwise shift the overdue
 * boundary by a day for part of every day. Set once at session load.
 */
let SITE_TODAY: string | null = null;
export function setSiteToday(iso?: string | null) {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) SITE_TODAY = iso;
}
export function isoToday(): string {
  if (SITE_TODAY) return SITE_TODAY;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Overdue is the UNION of what ERPNext stored and what the dates say.
 *
 * Neither alone is right:
 *
 * * The stored `status` is stale. Sales Invoice is not in the framework
 *   status_map; ERPNext writes `status` imperatively (sales_invoice.py:2271)
 *   on save, on a GL entry change, or from the DAILY `update_invoice_status`
 *   job (erpnext/hooks.py:464). An invoice that fell due overnight still
 *   reads "Unpaid" until that job runs.
 * * The date test is blind to instalments. `due_date` is the LAST row of the
 *   payment schedule (accounts_controller.py:2830), while ERPNext's
 *   `is_overdue` (sales_invoice.py:2343) compares what has been paid against
 *   the instalments already due. On a 3-instalment invoice with nothing paid,
 *   ERPNext calls it overdue after the first instalment; the date test would
 *   not, until the last.
 *
 * So take both. Confirmed with Priti, 19 Sep: derive it rather than trusting
 * the stored status alone.
 */
export function isInvoiceOverdue(row: InvoiceRow): boolean {
  if (row.docstatus !== 1) return false;
  if (row.is_return) return false;
  if ((row.outstanding_amount ?? 0) <= 0) return false;
  if (row.status && ERP_OVERDUE.includes(row.status)) return true;
  if (!row.due_date) return false;
  return row.due_date < isoToday();
}

export function invoiceUiStatus(row: InvoiceRow): InvUiStatus {
  if (row.docstatus === 2 || row.status === "Cancelled") return "Cancelled";
  if (row.docstatus === 0) return "Draft";
  /* Only the credit note itself is a Return. An ORIGINAL whose status reads
     "Credit Note Issued" is still an ordinary invoice that happens to have
     been reversed — calling it a Return made the Return filter and the pill
     disagree about the same row.                                          */
  if (row.is_return || row.status === "Return") return "Return";
  if (row.status === "Paid") return "Paid";
  if (isInvoiceOverdue(row)) return "Overdue";
  if (row.status === "Partly Paid" || row.status === "Partly Paid and Discounted") return "Part";
  return "Unpaid";
}

export const INV_PILL_CLASS: Record<InvUiStatus, string> = {
  Draft: "p-draft",
  Unpaid: "p-unpaid",
  Part: "p-partly",
  Overdue: "p-overdue",
  Paid: "p-paid",
  Return: "p-flat",
  Cancelled: "p-cxl",
};

export type InvoiceQuery = {
  filters: [string, string, unknown][];
  /** OR group, for the overdue union. Frappe ANDs `filters` with this group. */
  orFilters?: [string, string, unknown][];
};

/**
 * Server-side query for one UI status. Every branch produces exactly the set
 * that `invoiceUiStatus` would pill the same way — a filter that returns rows
 * the table then labels differently is worse than no filter at all.
 */
export function invoiceQueryFor(ui: InvUiStatus): InvoiceQuery {
  const open: [string, string, unknown][] = [
    ["docstatus", "=", 1], ["is_return", "=", 0], ["outstanding_amount", ">", 0],
  ];
  switch (ui) {
    case "Draft":
      return { filters: [["docstatus", "=", 0]] };
    case "Cancelled":
      return { filters: [["docstatus", "=", 2]] };
    case "Return":
      return { filters: [["is_return", "=", 1], ["docstatus", "<", 2]] };
    case "Paid":
      // Matches the pill, which reads `status`. outstanding <= 0 would also
      // catch a fully-credited original, which the pill calls Unpaid.
      return { filters: [["docstatus", "=", 1], ["is_return", "=", 0], ["status", "=", "Paid"]] };
    case "Overdue":
      return {
        filters: open,
        orFilters: [["due_date", "<", isoToday()], ["status", "in", ERP_OVERDUE]],
      };
    case "Part":
      // Overdue wins in the pill, so exclude it here too.
      return {
        filters: [
          ...open,
          ["status", "in", ["Partly Paid", "Partly Paid and Discounted"]],
          ["due_date", ">=", isoToday()],
        ],
      };
    case "Unpaid":
    default:
      return {
        filters: [
          ...open,
          ["due_date", ">=", isoToday()],
          ["status", "not in", [...ERP_OVERDUE, "Paid", "Partly Paid", "Partly Paid and Discounted"]],
        ],
      };
  }
}

/* ── Donut buckets — the four confirmed in the API doc, §3 ───────────── */

export const INV_STAGES = ["draft", "unpaid", "paid", "closed"] as const;
export type InvStage = (typeof INV_STAGES)[number];

export const INV_STAGE_COLOUR: Record<InvStage, string> = {
  draft: "var(--c-draft)",
  unpaid: "var(--c-confirmed)",
  paid: "var(--c-billed)",
  closed: "var(--c-delivered)",
};

/**
 * ERPNext's thirteen Sales Invoice statuses folded into the four confirmed in
 * the API doc, §3. The fourth bucket holds Cancelled AND the reversal
 * statuses (Return, Credit Note Issued, Internal Transfer), which is why its
 * label is "Cancelled / reversed" and not "Cancelled" — a book with five
 * credit notes and no cancellations would otherwise read as five cancelled
 * invoices.
 */
export function invoiceStage(erpStatus?: string, docstatus?: number): InvStage {
  if (docstatus === 2 || erpStatus === "Cancelled") return "closed";
  if (docstatus === 0 || erpStatus === "Draft") return "draft";
  if (erpStatus === "Paid") return "paid";
  if (erpStatus === "Return" || erpStatus === "Credit Note Issued" || erpStatus === "Internal Transfer") {
    return "closed";
  }
  return "unpaid";
}

/**
 * Whether a status posted to the ledger, and so belongs in a money total.
 * Only Draft (never posted) and Cancelled (reversed) are out — a credit note
 * or an internal transfer DID post, and excluding them overstates what is
 * owed.
 */
export function countsTowardBilled(erpStatus?: string): boolean {
  return erpStatus !== "Draft" && erpStatus !== "Cancelled";
}

/**
 * E-invoice state chip. Separate from EINVOICE_PILL because the list shows it
 * as a square chip beside a round status pill — an invoice can be Paid and
 * E-invoice Failed at once, and the two axes should not look alike.
 */
export const EINVOICE_CHIP: Record<string, string> = {
  Draft: "e-none",
  Generated: "e-generated",
  Queued: "e-queued",
  Submitted: "e-submitted",
  Accepted: "e-accepted",
  Rejected: "e-rejected",
  Failed: "e-failed",
  Cancelled: "e-cancelled",
};

export const EINVOICE_PILL: Record<string, string> = {
  Draft: "p-draft",
  Generated: "p-open",
  Queued: "p-warn",
  Submitted: "p-open",
  Accepted: "p-done",
  Rejected: "p-overdue",
  Failed: "p-overdue",
  Cancelled: "p-cxl",
};
