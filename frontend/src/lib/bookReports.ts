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

export function bookFilters(
  report: string,
  ctx: { company: string; fiscalYear?: string; fromDate: string; toDate: string },
): Record<string, unknown> {
  const { company, fiscalYear, fromDate, toDate } = ctx;
  if (report === "Trial Balance") {
    return { company, fiscal_year: fiscalYear, from_date: fromDate, to_date: toDate };
  }
  if (report === "General Ledger") {
    return {
      company,
      from_date: fromDate,
      to_date: toDate,
      categorize_by: "Categorize by Voucher (Consolidated)",
    };
  }
  if (
    report === "Profit and Loss Statement"
    || report === "Balance Sheet"
    || report === "Cash Flow"
  ) {
    return {
      company,
      filter_based_on: "Date Range",
      periodicity: "Yearly",
      from_fiscal_year: fiscalYear,
      to_fiscal_year: fiscalYear,
      period_start_date: fromDate,
      period_end_date: toDate,
      accumulated_values: report === "Balance Sheet" ? 1 : 0,
    };
  }
  return { company, from_date: fromDate, to_date: toDate };
}
