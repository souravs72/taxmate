import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { bookFilters, isRunnableReport } from "../../lib/bookReports";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { money, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Empty, ErrorBox, Field, Loading, PageHead, StatTile } from "../../components/ui";

type Col = { fieldname?: string; label?: string; fieldtype?: string };
type Row = Record<string, unknown>;
type Chart = { data?: { labels?: string[]; datasets?: { name?: string; values?: number[] }[] } };
type Payload = { result?: Row[]; columns?: Col[]; chart?: Chart };

function yearStart(iso?: string): string {
  const d = iso || toIsoDate(new Date());
  return `${d.slice(0, 4)}-01-01`;
}

function cell(row: Row, col: Col): string {
  const key = col.fieldname || "";
  const v = row[key];
  if (v == null || v === "") return "—";
  if (typeof v === "number" || col.fieldtype === "Currency" || col.fieldtype === "Float") {
    return money(Number(v));
  }
  return String(v);
}

export default function ReportRunner() {
  const { report = "" } = useParams();
  const name = decodeURIComponent(report);
  const nav = useNavigate();
  const session = useSession();
  const { get, set } = useListParams(20);
  const today = session.today || toIsoDate(new Date());
  const fromDate = get("from") || yearStart(today);
  const toDate = get("to") || today;
  const company = session.company;
  const defaults = useFrappeGetCall<{ message: { fiscal_year?: string } }>(
    METHOD.getDefaults,
    { company },
    company ? `defaults-${company}` : null,
  );
  const fiscalYear = defaults.data?.message?.fiscal_year;
  const allowed = isRunnableReport(name);
  const needsFy = name === "Trial Balance" || name === "Profit and Loss Statement"
    || name === "Balance Sheet" || name === "Cash Flow";
  const paused = !session.user || !company || !allowed || (needsFy && !fiscalYear);

  const filters = useMemo(() => {
    if (!company) return {};
    return bookFilters(name, { company, fiscalYear, fromDate, toDate });
  }, [name, company, fiscalYear, fromDate, toDate]);

  const run = useFrappeGetCall<{ message: Payload }>(
    METHOD.runReport,
    { report_name: name, filters },
    paused ? null : `rpt-${name}-${JSON.stringify(filters)}`,
  );

  const columns = (run.data?.message?.columns ?? []).filter((c) => c.fieldname);
  const rows = (run.data?.message?.result ?? []).filter((r) => r && typeof r === "object" && !Array.isArray(r));
  const chart = run.data?.message?.chart;
  const labels = chart?.data?.labels ?? [];
  const series = chart?.data?.datasets?.[0];
  const values = series?.values ?? [];
  const chartTotal = values.reduce((a, n) => a + (Number(n) || 0), 0);

  if (!allowed) {
    return (
      <>
        <PageHead
          eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/reports")}>{t("rpt.title")}</button>}
          title={name}
        />
        <Empty label={t("rpt.unsupported")} />
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/reports")}>{t("rpt.title")}</button>}
        title={name}
      />
      <Card>
        <div className="grid2">
          <Field label={t("rpt.from")}>
            <input className="ctl" type="date" value={fromDate} onChange={(e) => set("from", e.target.value)} />
          </Field>
          <Field label={t("rpt.to")}>
            <input className="ctl" type="date" value={toDate} onChange={(e) => set("to", e.target.value)} />
          </Field>
        </div>
      </Card>

      {run.error && <ErrorBox error={run.error} onRetry={() => run.mutate()} />}

      {run.data && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h4.5"/>'
            label={t("rpt.tile.rows")} value={rows.length}
            foot={t("rpt.tile.rowsFoot")} />
        </div>
      )}

      {labels.length > 0 && values.length > 0 && (
        <Card title={t("rpt.chart")} hint={series?.name || t("rpt.chartHint")} bodyClass="bars">
          {labels.map((label, i) => (
            <BarRow
              key={`${label}-${i}`}
              label={String(label)}
              currency={session.currency || undefined}
              value={chartTotal ? (Number(values[i]) / Math.abs(chartTotal)) * 100 : 0}
              amount={Number(values[i]) || 0}
              colour="var(--c-confirmed)"
            />
          ))}
        </Card>
      )}

      <Card bodyClass={null as unknown as string}>
        {paused || run.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("rpt.empty")} />
          : (
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.fieldname} className={c.fieldtype === "Currency" || c.fieldtype === "Float" ? "n" : undefined}>
                        {c.label || c.fieldname}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={row.bold ? { fontWeight: 600 } : undefined}>
                      {columns.map((c) => (
                        <td key={c.fieldname} className={c.fieldtype === "Currency" || c.fieldtype === "Float" ? "n tot" : undefined}>
                          {cell(row, c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
