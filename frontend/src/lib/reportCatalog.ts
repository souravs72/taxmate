/**
 * How the Reports screen groups and describes each report.
 *
 * The list of reports still comes from the server (`taxmate.api.reports.list_reports`);
 * this file only says, for a report the server sent, which section it belongs to,
 * which icon it gets and what its one line says. A report the server sends that is
 * not listed here still appears, under "Other reports".
 */

export type ReportSection = "statements" | "ledgers" | "stock" | "uae" | "other";

export type ReportMeta = {
  section: ReportSection;
  /** i18n key for the one-line description, e.g. rpt.d.trialBalance */
  desc: string;
  icon: IconKey;
};

export type IconKey =
  | "chart" | "scale" | "cash" | "statement" | "ledger" | "people"
  | "box" | "moves" | "shield" | "send" | "clock" | "match"
  | "group" | "import" | "tax" | "health" | "export";

/** Single-path icons, drawn at 24×24 with stroke: currentColor. */
export const ICON_PATH: Record<IconKey, string> = {
  chart: "M4.5 19.5v-7 M9.5 19.5V7 M14.5 19.5v-4 M19.5 19.5V4.5",
  scale: "M12 4v16 M5 8h14 M5 8 2.5 14h5z M19 8l-2.5 6h5z",
  cash: "M3.5 6.5h17v11h-17z M12 14a2 2 0 100-4 2 2 0 000 4",
  statement: "M6 3.5h9l4 4v13H6z M15 3.5v4h4 M9.5 12h6 M9.5 15.5h4",
  ledger: "M5 3.5h11l3 3v14H5z M8.5 9h7 M8.5 12.5h7 M8.5 16h4",
  people: "M8.5 11a3 3 0 100-6 3 3 0 000 6 M3.5 19.5c0-2.8 2.2-5 5-5s5 2.2 5 5 M16 8.5a2.5 2.5 0 100-5 M15.5 14.8c2.6.2 4.6 2.3 4.6 4.7",
  box: "M12 3.5 20 7.5v9l-8 4-8-4v-9z M4 7.5l8 4 8-4 M12 11.5v9",
  moves: "M4 8h11l-3-3 M20 16H9l3 3",
  shield: "M12 3.5 19.5 6v6c0 4.2-3 7-7.5 8.5C7.5 19 4.5 16.2 4.5 12V6z M9 12l2 2 4-4",
  send: "M3.5 11.5 20.5 4l-6 16.5-3-7z M11.5 13.5 20.5 4",
  clock: "M12 5.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13 M12 8.5V12l2.5 1.5",
  match: "M6 6.5h5v11H6z M13 6.5h5v11h-5z M11 12h2",
  group: "M7 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5 M17 10.5a2.5 2.5 0 100-5 M12 19.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5 M8.6 8.5h6.8 M8.7 12.2l2 2.6 M15.3 12.2l-2 2.6",
  import: "M12 3.5v10 M8 10l4 4 4-4 M4.5 19.5h15",
  tax: "M8 4.5h8l2 3v13H6v-13z M9.5 12h5 M9.5 15.5h5 M9.5 8.5h2",
  health: "M4.5 12h3l2-5 3 10 2-5h5",
  export: "M14 3.5H7v17h10V7z M14 3.5V7h3 M12 10v6 M9.5 13.5 12 16l2.5-2.5",
};

export const SECTION_ORDER: ReportSection[] = ["statements", "ledgers", "stock", "uae", "other"];

export const REPORT_META: Record<string, ReportMeta> = {
  "Profit and Loss Statement": { section: "statements", desc: "rpt.d.pl", icon: "chart" },
  "Balance Sheet": { section: "statements", desc: "rpt.d.bs", icon: "scale" },
  "Cash Flow": { section: "statements", desc: "rpt.d.cf", icon: "cash" },
  "Trial Balance": { section: "statements", desc: "rpt.d.tb", icon: "statement" },

  "General Ledger": { section: "ledgers", desc: "rpt.d.gl", icon: "ledger" },
  "Customer Ledger Summary": { section: "ledgers", desc: "rpt.d.cl", icon: "people" },
  "Supplier Ledger Summary": { section: "ledgers", desc: "rpt.d.sl", icon: "people" },
  "Accounts Receivable": { section: "ledgers", desc: "rpt.d.ar", icon: "people" },
  "Accounts Payable": { section: "ledgers", desc: "rpt.d.ap", icon: "people" },

  "Stock Balance": { section: "stock", desc: "rpt.d.sb", icon: "box" },
  "Stock Ledger": { section: "stock", desc: "rpt.d.sled", icon: "moves" },

  "UAE VAT 201": { section: "uae", desc: "rpt.d.vat", icon: "shield" },
  "UAE E-Invoice Status": { section: "uae", desc: "rpt.d.einv", icon: "send" },
  "UAE Late Filing Status": { section: "uae", desc: "rpt.d.late", icon: "clock" },
  "UAE E-Invoice VAT 201 Reconciliation": { section: "uae", desc: "rpt.d.recon", icon: "match" },
  "UAE Group VAT Status": { section: "uae", desc: "rpt.d.group", icon: "group" },
  "UAE Import VAT Explanation": { section: "uae", desc: "rpt.d.import", icon: "import" },
  "UAE Corporate Tax Worksheet": { section: "uae", desc: "rpt.d.ct", icon: "tax" },
  "UAE Compliance Status": { section: "uae", desc: "rpt.d.compliance", icon: "health" },
  "EmaraTax Export": { section: "uae", desc: "rpt.d.emaratax", icon: "export" },
};

export function metaFor(report: string): ReportMeta {
  return REPORT_META[report] ?? { section: "other", desc: "", icon: "statement" };
}

/* ── Pinned reports: one per browser, no server round trip ──────────── */

const PIN_KEY = "taxmate-pinned-reports";

export function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // Private windows and blocked site data both land here; pins are a convenience.
    return [];
  }
}

export function writePinned(list: string[]): void {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    /* nothing to do: the list still works for this visit */
  }
}
