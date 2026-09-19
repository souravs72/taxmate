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

export const INV_UI_STATUSES = ["Draft", "Unpaid", "Part", "Paid", "Return", "Cancelled"] as const;
export type InvUiStatus = (typeof INV_UI_STATUSES)[number];

export function invoiceUiStatus(row: {
  docstatus?: number;
  status?: string;
  is_return?: number;
}): InvUiStatus {
  if (row.docstatus === 2 || row.status === "Cancelled") return "Cancelled";
  if (row.docstatus === 0) return "Draft";
  if (row.is_return || row.status === "Return" || row.status === "Credit Note Issued") return "Return";
  if (row.status === "Paid") return "Paid";
  if (row.status === "Partly Paid") return "Part";
  return "Unpaid";
}

export const INV_PILL_CLASS: Record<InvUiStatus, string> = {
  Draft: "p-draft",
  Unpaid: "p-warn",
  Part: "p-open",
  Paid: "p-done",
  Return: "p-flat",
  Cancelled: "p-cxl",
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
