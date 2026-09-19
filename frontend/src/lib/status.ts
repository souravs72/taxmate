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
  if (o.docstatus === 0 || o.status === "Draft") return "draft";
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
