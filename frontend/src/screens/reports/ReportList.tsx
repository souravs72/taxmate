import { memo, useCallback, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import {
  CORE_BOOK_REPORTS,
  UAE_CATALOG_REPORTS,
  reportBlurbKey,
} from "../../lib/bookReports";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead } from "../../components/ui";
import { SearchFilter } from "../../components/filters";

type CatalogReport = { label: string; report: string };

const STROKE = {
  viewBox: "0 0 18 18",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICONS: Record<string, ReactNode> = {
  "Trial Balance": <><path d="M3 15h12" /><path d="M9 3v10" /><path d="M5 8h3M10 11h3" /></>,
  "General Ledger": <><path d="M4 4h10M4 9h10M4 14h7" /></>,
  "Profit and Loss Statement": <><path d="M3 13l4-4 3 2 5-6" /><path d="M12 5h3v3" /></>,
  "Balance Sheet": <><path d="M3 15V7h4v8M7 15V4h4v11M11 15V9h4v6" /></>,
  "Cash Flow": <><path d="M3 9h12" /><path d="M12 6l3 3-3 3" /><path d="M6 12L3 9l3-3" /></>,
  "Customer Ledger Summary": <><circle cx="7" cy="6" r="2.2" /><path d="M3.5 14c.4-2.2 2-3.5 3.5-3.5S10.1 11.8 10.5 14" /><path d="M12 8h3M12 11h3" /></>,
  "Supplier Ledger Summary": <><path d="M3 12h12v3H3z" /><path d="M5 12V8l3-2h5l2 2v4" /><circle cx="6.5" cy="15" r="1" /><circle cx="13" cy="15" r="1" /></>,
  "UAE VAT 201": <><path d="M4 5h10v10H4z" /><path d="M7 9h4M9 7v4" /></>,
  "UAE Late Filing Status": <><circle cx="9" cy="9" r="6" /><path d="M9 5.5V9l2.5 1.5" /></>,
  "UAE Group VAT Status": <><circle cx="6.5" cy="7" r="2" /><circle cx="11.5" cy="7" r="2" /><path d="M3.5 14c.3-2 1.6-3 3-3s2.7 1 3 3M9.5 14c.3-2 1.6-3 3-3s2.7 1 3 3" /></>,
  "UAE Import VAT Explanation": <><path d="M9 3v10" /><path d="M5 9l4 4 4-4" /><path d="M4 15h10" /></>,
  "UAE E-Invoice Status": <><path d="M5 3.5h6l3 3V15H5z" /><path d="M11 3.5V7h3" /></>,
  "UAE E-Invoice VAT 201 Reconciliation": <><path d="M4 4h7v10H4z" /><path d="M8 4v3h3" /><path d="M10 7h4v8H8" /></>,
  "EmaraTax Export": <><path d="M9 12V4" /><path d="M6 7l3-3 3 3" /><path d="M4 14h10" /></>,
  "UAE Corporate Tax Worksheet": <><path d="M4 4h10v12H4z" /><path d="M7 8h4M7 11h4" /></>,
  "UAE Compliance Status": <><path d="M9 3l6 2.5v5c0 3.2-2.4 5.2-6 6.5-3.6-1.3-6-3.3-6-6.5v-5z" /><path d="M6.5 9.2 8.2 11l3.4-3.6" /></>,
};

function matches(row: CatalogReport, q: string): boolean {
  if (!q) return true;
  const blurb = reportBlurbKey(row.report);
  const hay = `${row.label} ${row.report} ${blurb ? t(blurb) : ""}`.toLowerCase();
  return hay.includes(q);
}

const ReportTile = memo(function ReportTile({
  row,
  tone,
  onOpen,
}: {
  row: CatalogReport;
  tone: "books" | "uae";
  onOpen: (report: string) => void;
}) {
  const blurb = reportBlurbKey(row.report);
  return (
    <button
      type="button"
      className={`rpt-item rpt-${tone}`}
      onClick={() => onOpen(row.report)}
    >
      <span className="rpt-ic" aria-hidden="true">
        <svg {...STROKE}>{ICONS[row.report] ?? ICONS["General Ledger"]}</svg>
      </span>
      <span className="rpt-copy">
        <span className="rpt-name">{row.label}</span>
        {blurb && <span className="rpt-desc">{t(blurb)}</span>}
      </span>
    </button>
  );
});

function Section({
  title,
  rows,
  tone,
  onOpen,
}: {
  title: string;
  rows: CatalogReport[];
  tone: "books" | "uae";
  onOpen: (report: string) => void;
}) {
  if (!rows.length) return null;
  const id = `rpt-${tone}`;
  return (
    <section className="rpt-sec" aria-labelledby={id}>
      <h2 id={id}>
        {title}
        <span>{rows.length}</span>
      </h2>
      <div className="rpt-grid">
        {rows.map((row) => (
          <ReportTile key={row.report} row={row} tone={tone} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default function ReportList() {
  const nav = useNavigate();
  const { get, set } = useListParams(20);
  const q = get("q").trim().toLowerCase();
  const catalog = useFrappeGetCall<{ message: CatalogReport[] }>(METHOD.listReports);
  const all = catalog.data?.message ?? [];

  const books = useMemo(() => {
    const allowed = new Set<string>(CORE_BOOK_REPORTS);
    return all.filter((row) => allowed.has(row.report) && matches(row, q));
  }, [all, q]);
  const uae = useMemo(() => {
    const allowed = new Set<string>(UAE_CATALOG_REPORTS);
    return all.filter((row) => allowed.has(row.report) && matches(row, q));
  }, [all, q]);

  const open = useCallback((report: string) => {
    nav(`/reports/${encodeURIComponent(report)}`);
  }, [nav]);

  const catalogEmpty = all.length === 0;
  const filteredEmpty = !catalogEmpty && books.length + uae.length === 0;

  return (
    <div className="rpt-run">
      <PageHead title={t("rpt.title")} sub={t("rpt.sub")} />
      {catalog.error && <ErrorBox error={catalog.error} onRetry={() => catalog.mutate()} />}
      {catalog.isLoading ? <Loading /> : catalogEmpty ? (
        <Card><Empty label={t("rpt.empty")} /></Card>
      ) : (
        <Card bodyClass="rpt-cat">
          <div className="rpt-find">
            <SearchFilter value={get("q")} onChange={(v) => set("q", v)} placeholder={t("rpt.search")} />
          </div>
          {filteredEmpty ? (
            <Empty label={t("rpt.none")} />
          ) : (
            <>
              <Section title={t("rpt.books")} rows={books} tone="books" onOpen={open} />
              <Section title={t("rpt.uae")} rows={uae} tone="uae" onOpen={open} />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
