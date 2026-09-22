/** Documented `run_report` filter objects. Never send a list of lists. */

export const CORE_BOOK_REPORTS = [
  "Trial Balance",
  "General Ledger",
  "Profit and Loss Statement",
  "Balance Sheet",
  "Cash Flow",
  "Customer Ledger Summary",
  "Supplier Ledger Summary",
] as const;

export const UAE_CATALOG_REPORTS = [
  "UAE VAT 201",
  "UAE Late Filing Status",
  "UAE Group VAT Status",
  "UAE Import VAT Explanation",
  "UAE E-Invoice Status",
  "UAE E-Invoice VAT 201 Reconciliation",
  "EmaraTax Export",
  "UAE Corporate Tax Worksheet",
  "UAE Compliance Status",
] as const;

export type CoreBookReport = (typeof CORE_BOOK_REPORTS)[number];
export type UaeCatalogReport = (typeof UAE_CATALOG_REPORTS)[number];

export function isCoreBookReport(name: string): name is CoreBookReport {
  return (CORE_BOOK_REPORTS as readonly string[]).includes(name);
}

export function isUaeCatalogReport(name: string): name is UaeCatalogReport {
  return (UAE_CATALOG_REPORTS as readonly string[]).includes(name);
}

export function isRunnableReport(name: string): boolean {
  return isCoreBookReport(name) || isUaeCatalogReport(name);
}

/** One-line purpose. Keys live in i18n — never the report name again. */
const REPORT_BLURB: Record<string, string> = {
  "Trial Balance": "rpt.d.trialBalance",
  "General Ledger": "rpt.d.generalLedger",
  "Profit and Loss Statement": "rpt.d.profitLoss",
  "Balance Sheet": "rpt.d.balanceSheet",
  "Cash Flow": "rpt.d.cashFlow",
  "Customer Ledger Summary": "rpt.d.customerLedger",
  "Supplier Ledger Summary": "rpt.d.supplierLedger",
  "UAE VAT 201": "rpt.d.vat201",
  "UAE Late Filing Status": "rpt.d.lateFiling",
  "UAE Group VAT Status": "rpt.d.groupVat",
  "UAE Import VAT Explanation": "rpt.d.importVat",
  "UAE E-Invoice Status": "rpt.d.eInvoice",
  "UAE E-Invoice VAT 201 Reconciliation": "rpt.d.eInvoiceVat",
  "EmaraTax Export": "rpt.d.emaraTax",
  "UAE Corporate Tax Worksheet": "rpt.d.corporateTax",
  "UAE Compliance Status": "rpt.d.compliance",
};

export function reportBlurbKey(report: string): string | undefined {
  return REPORT_BLURB[report];
}

export const PERIODICITIES = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"] as const;
export type Periodicity = (typeof PERIODICITIES)[number];

export const GL_CATEGORIES = [
  "Categorize by Voucher (Consolidated)",
  "Categorize by Voucher",
  "Categorize by Account",
  "Categorize by Party",
] as const;

/** Filters this runner may send — each key exists on the ERPNext / TaxMate report. */
export type FilterCtx = {
  company: string;
  fiscalYear?: string;
  fromDate: string;
  toDate: string;
  periodicity?: Periodicity;
  costCenter?: string;
  account?: string;
  partyType?: string;
  party?: string;
  voucherNo?: string;
  categorizeBy?: string;
  showZeros?: boolean;
  accumulated?: boolean;
  showGroups?: boolean;
  status?: string;
  sla?: string;
  electSbr?: boolean;
  electQfzp?: boolean;
};

export type ReportCaps = {
  dates: boolean;
  periodChips: boolean;
  periodicity: boolean;
  costCenter: boolean;
  account: boolean;
  party: "Customer" | "Supplier" | "typed" | false;
  voucher: boolean;
  categorize: boolean;
  zeros: boolean;
  accumulated: boolean;
  groups: boolean;
  status: readonly string[];
  sla: readonly string[];
  ctElections: boolean;
  tree: boolean;
};

const LATE_STATUS = ["Due", "Overdue", "Cleared"] as const;
const EINV_STATUS = ["Draft", "Generated", "Queued", "Submitted", "Accepted", "Rejected", "Failed"] as const;
const SLA = ["Open", "Met", "Late", "Breached"] as const;

export function reportCaps(report: string): ReportCaps {
  const statement = report === "Profit and Loss Statement" || report === "Balance Sheet" || report === "Cash Flow";
  const tb = report === "Trial Balance";
  const gl = report === "General Ledger";
  const none = [] as const;
  return {
    dates: !["UAE Late Filing Status", "UAE Group VAT Status", "UAE E-Invoice Status", "UAE Compliance Status"].includes(report),
    periodChips: statement || tb || gl || report === "Customer Ledger Summary" || report === "Supplier Ledger Summary"
      || report === "UAE VAT 201" || report === "UAE Import VAT Explanation"
      || report === "UAE E-Invoice VAT 201 Reconciliation" || report === "EmaraTax Export"
      || report === "UAE Corporate Tax Worksheet",
    periodicity: statement,
    costCenter: statement || tb || gl,
    account: gl,
    party: report === "Customer Ledger Summary" ? "Customer"
      : report === "Supplier Ledger Summary" ? "Supplier"
      : gl ? "typed" : false,
    voucher: gl,
    categorize: gl,
    zeros: statement || tb,
    accumulated: statement,
    groups: tb,
    status: report === "UAE Late Filing Status" ? LATE_STATUS
      : report === "UAE E-Invoice Status" ? EINV_STATUS : none,
    sla: report === "UAE E-Invoice Status" ? SLA : none,
    ctElections: report === "UAE Corporate Tax Worksheet",
    tree: statement || tb,
  };
}

export function bookFilters(report: string, ctx: FilterCtx): Record<string, unknown> {
  const { company, fiscalYear, fromDate, toDate } = ctx;
  if (report === "Trial Balance") {
    const out: Record<string, unknown> = {
      company, fiscal_year: fiscalYear, from_date: fromDate, to_date: toDate,
    };
    if (ctx.costCenter) out.cost_center = [ctx.costCenter];
    if (ctx.showZeros) out.show_zero_values = 1;
    if (ctx.showGroups === false) out.show_group_accounts = 0;
    return out;
  }
  if (report === "General Ledger") {
    const out: Record<string, unknown> = {
      company,
      from_date: fromDate,
      to_date: toDate,
      categorize_by: ctx.categorizeBy || "Categorize by Voucher (Consolidated)",
    };
    if (ctx.account) out.account = [ctx.account];
    if (ctx.partyType) out.party_type = ctx.partyType;
    if (ctx.party) out.party = [ctx.party];
    if (ctx.voucherNo) out.voucher_no = ctx.voucherNo;
    if (ctx.costCenter) out.cost_center = [ctx.costCenter];
    return out;
  }
  if (
    report === "Profit and Loss Statement"
    || report === "Balance Sheet"
    || report === "Cash Flow"
  ) {
    const out: Record<string, unknown> = {
      company,
      filter_based_on: "Date Range",
      periodicity: ctx.periodicity || "Monthly",
      from_fiscal_year: fiscalYear,
      to_fiscal_year: fiscalYear,
      period_start_date: fromDate,
      period_end_date: toDate,
      accumulated_values: (ctx.accumulated ?? report === "Balance Sheet") ? 1 : 0,
    };
    if (ctx.costCenter) out.cost_center = [ctx.costCenter];
    if (ctx.showZeros) out.show_zero_values = 1;
    return out;
  }
  if (report === "UAE Late Filing Status") {
    const out: Record<string, unknown> = { company };
    if (ctx.status) out.status = ctx.status;
    return out;
  }
  if (report === "UAE E-Invoice Status") {
    const out: Record<string, unknown> = { company };
    if (ctx.status) out.status = ctx.status;
    if (ctx.sla) out.sla = ctx.sla;
    return out;
  }
  if (report === "UAE Group VAT Status" || report === "UAE Compliance Status") {
    return { company };
  }
  if (report === "Customer Ledger Summary" || report === "Supplier Ledger Summary") {
    const out: Record<string, unknown> = { company, from_date: fromDate, to_date: toDate };
    if (ctx.party) out.party = ctx.party;
    return out;
  }
  if (report === "UAE Corporate Tax Worksheet") {
    return {
      company, from_date: fromDate, to_date: toDate,
      elect_sbr: ctx.electSbr ? 1 : 0,
      elect_qfzp: ctx.electQfzp ? 1 : 0,
    };
  }
  return { company, from_date: fromDate, to_date: toDate };
}

export function chipRange(
  kind: "month" | "quarter" | "ytd" | "fy",
  today: string,
  fyStart?: string,
  fyEnd?: string,
): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  if (kind === "month") {
    return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
  }
  if (kind === "quarter") {
    const q = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: `${y}-${String(q).padStart(2, "0")}-01`, to: today };
  }
  if (kind === "fy" && fyStart && fyEnd) {
    return { from: fyStart, to: fyEnd < today ? fyEnd : today };
  }
  return { from: `${y}-01-01`, to: today };
}
