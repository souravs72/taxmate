import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { date, daysBetween, money } from "../../lib/format";
import type { FilterTuple } from "../../lib/list";
import { t } from "../../i18n/strings";
import { BarRow, Card, Empty, ErrorBox, Loading, PageHead, Pill, StatTile } from "../../components/ui";

type HomeKpi = { name: string; label: string; value: number };

type VatRow = {
  name: string;
  period_start?: string;
  period_end?: string;
  filing_due_date?: string;
  status?: string;
  deadline_status?: string;
  net_vat_due?: number;
  tax_currency?: string;
};

type LogRow = {
  name: string;
  status?: string;
  reference_name?: string;
  reference_doctype?: string;
};

type InvRow = {
  name: string;
  customer_name?: string;
  customer?: string;
  posting_date?: string;
  grand_total?: number;
  currency?: string;
  status?: string;
};

type Fulfilment = {
  currency?: string;
  committed: number;
  delivered_value: number;
  billed_value: number;
  open_count: number;
  overdue_count: number;
};

function kpiValue(kpis: HomeKpi[], name: string): number | undefined {
  return kpis.find((k) => k.name === name)?.value;
}

function shownCount(loading: boolean, value: number | undefined): string | number {
  if (loading || value == null) return "—";
  return value;
}

function firstName(full?: string, user?: string): string {
  const raw = (full || user || "").trim();
  if (!raw) return "";
  return raw.split(/[\s@._-]/)[0];
}

function deadlinePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Filed") return "p-done";
  return "p-open";
}

function dueFoot(today: string | undefined, due?: string): string {
  if (!due) return "";
  if (!today) return date(due);
  const days = daysBetween(today, due);
  if (days < 0) return t("dash.daysOverdue").replace("{n}", String(-days));
  if (days === 0) return t("dash.dueToday");
  return t("dash.dueIn").replace("{n}", String(days));
}

export default function Dashboard() {
  const nav = useNavigate();
  const session = useSession();
  const name = firstName(session.full_name, session.user);
  const today = session.today;

  const sessionReady = !!session.user;
  const companyFilter: FilterTuple[] = session.company
    ? [["company", "=", session.company]]
    : [];
  const pauseKey = sessionReady ? undefined : null;

  const home = useFrappeGetCall<{ message: { kpis: HomeKpi[] } }>(METHOD.getHome);
  const kpis = home.data?.message?.kpis ?? [];
  const homeLoading = home.isLoading;

  const overdue = useDocCount(
    DT.salesInvoice,
    [["status", "=", "Overdue"], ...companyFilter],
    undefined,
    pauseKey,
  );

  const fulfilment = useFrappeGetCall<{ message: Fulfilment }>(
    METHOD.fulfilmentSummary,
    {},
    undefined,
    { shouldRetryOnError: false },
  );
  const fulfil = fulfilment.data?.message;
  const fulfilCur = fulfil?.currency || session.currency || "";
  const committed = fulfil?.committed ?? 0;

  const vat = useDocList<VatRow>(DT.vat201, {
    fields: [
      "name", "period_start", "period_end", "filing_due_date",
      "status", "deadline_status", "net_vat_due", "tax_currency",
    ],
    filters: [["docstatus", "<", 2], ...companyFilter],
    orderBy: { field: "filing_due_date", order: "asc" },
    limit: 8,
  }, pauseKey);

  const failed = useDocList<LogRow>(DT.eInvoiceLog, {
    fields: ["name", "status", "reference_name", "reference_doctype"],
    filters: [["status", "in", ["Failed", "Rejected"]], ...companyFilter],
    orderBy: { field: "modified", order: "desc" },
    limit: 6,
  }, pauseKey);

  const recent = useDocList<InvRow>(DT.salesInvoice, {
    fields: ["name", "customer_name", "customer", "posting_date", "grand_total", "currency", "status"],
    filters: companyFilter,
    orderBy: { field: "posting_date", order: "desc" },
    limit: 6,
  }, pauseKey);

  const deliveredPct = committed ? ((fulfil?.delivered_value ?? 0) / committed) * 100 : 0;
  const billedPct = committed ? ((fulfil?.billed_value ?? 0) / committed) * 100 : 0;

  return (
    <>
      <PageHead
        title={name ? `${t("dash.hello")}, ${name}` : t("nav.dashboard")}
        sub={session.company ? `${session.company} · ${date(today)}` : date(today)}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/customers/new")}>{t("hub.newCustomer")}</button>
            <button type="button" className="btn ghost" onClick={() => nav("/payments/new")}>{t("hub.receive")}</button>
            <button type="button" className="btn" onClick={() => nav("/invoices/new")}>＋ {t("hub.newSale")}</button>
          </>
        }
      />

      {home.error && <ErrorBox error={home.error} onRetry={() => home.mutate()} />}
      {overdue.error && <ErrorBox error={overdue.error} onRetry={() => overdue.mutate()} />}

      <div className="tiles">
        <button type="button" className="tilebtn" onClick={() => nav("/invoices?status=Draft")}>
          <StatTile
            colour="var(--warn)" tint="rgba(217,119,6,.12)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/>'
            label={t("hub.draft")}
            value={shownCount(homeLoading, kpiValue(kpis, "Draft Sales Invoices"))}
            foot={t("hub.draftFoot")}
          />
        </button>
        <button type="button" className="tilebtn" onClick={() => nav("/receivables")}>
          <StatTile
            colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("hub.overdue")}
            value={shownCount(overdue.isLoading, overdue.data)}
            foot={t("hub.overdueFoot")}
          />
        </button>
        <button type="button" className="tilebtn" onClick={() => nav("/e-invoice-log")}>
          <StatTile
            colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5l5.5 2.2V10c0 3.3-2.4 5.7-5.5 6.5C5.9 15.7 3.5 13.3 3.5 10V4.7z"/>'
            label={t("hub.failed")}
            value={shownCount(homeLoading, kpiValue(kpis, "Failed E-Invoices"))}
            foot={t("hub.failedFoot")}
          />
        </button>
        <div>
          <StatTile
            colour="var(--warn)" tint="rgba(217,119,6,.12)"
            icon='<path d="M3.5 3.5h11v11h-11z"/><path d="M3.5 7h11M7 3.5V7"/>'
            label={t("dash.vatOverdue")}
            value={shownCount(homeLoading, kpiValue(kpis, "Overdue VAT 201"))}
            foot={t("dash.vatOverdueFoot")}
          />
        </div>
      </div>

      <div className="dash-board">
        <Card title={t("dash.deadlines")} hint={t("dash.deadlinesHint")}>
          {vat.error && <ErrorBox error={vat.error} onRetry={() => vat.mutate()} />}
          {vat.isLoading ? <Loading />
            : vat.error ? null
            : (vat.data ?? []).length === 0 ? <Empty label={t("dash.noFilings")} />
            : (vat.data ?? []).map((row) => (
              <div className="qrow static" key={row.name}>
                <span>
                  <span className="qtitle">{row.name}</span>
                  <span className="qsub">
                    {date(row.period_start)} – {date(row.period_end)}
                    {row.filing_due_date ? ` · ${dueFoot(today, row.filing_due_date)}` : ""}
                  </span>
                </span>
                <span className="qmeta">
                  <span className="qamt">
                    {row.tax_currency || fulfilCur} {money(row.net_vat_due)}
                  </span>
                  <Pill cls={deadlinePill(row.deadline_status)}>
                    {row.deadline_status || row.status || "—"}
                  </Pill>
                </span>
              </div>
            ))}
        </Card>

        <div className="stack">
          <Card
            title={t("dash.fulfilment")}
            hint={
              <button type="button" className="btn quiet sm" onClick={() => nav("/orders")}>{t("dash.viewOrders")}</button>
            }
          >
            {fulfilment.error && <ErrorBox error={fulfilment.error} onRetry={() => fulfilment.mutate()} />}
            {fulfilment.isLoading ? <Loading /> : fulfilment.error ? null : fulfil ? (
              <>
                <p className="qsub" style={{ margin: "0 0 12px" }}>
                  {t("dash.openOrders").replace("{n}", String(fulfil.open_count))}
                  {fulfil.overdue_count
                    ? ` · ${t("dash.lateOrders").replace("{n}", String(fulfil.overdue_count))}`
                    : ""}
                </p>
                <BarRow
                  label={t("so.bar.delivered")}
                  value={deliveredPct}
                  amount={fulfil.delivered_value}
                  colour="var(--c-delivered)"
                  currency={fulfilCur}
                />
                <BarRow
                  label={t("so.bar.billed")}
                  value={billedPct}
                  amount={fulfil.billed_value}
                  colour="var(--c-billed)"
                  currency={fulfilCur}
                />
              </>
            ) : <Empty label={t("dash.noFulfilment")} />}
          </Card>

          <Card
            title={t("dash.recentInvoices")}
            hint={<button type="button" className="btn quiet sm" onClick={() => nav("/invoices")}>{t("dash.viewAll")}</button>}
          >
            {recent.error && <ErrorBox error={recent.error} onRetry={() => recent.mutate()} />}
            {recent.isLoading ? <Loading />
              : recent.error ? null
              : (recent.data ?? []).length === 0 ? <Empty label={t("dash.noInvoices")} />
              : (recent.data ?? []).map((row) => (
                <button
                  type="button"
                  key={row.name}
                  className="qrow"
                  onClick={() => nav(`/invoices/${encodeURIComponent(row.name)}`)}
                >
                  <span>
                    <span className="qtitle">{row.name}</span>
                    <span className="qsub">{row.customer_name || row.customer || "—"} · {date(row.posting_date)}</span>
                  </span>
                  <span className="qmeta">
                    <span className="qamt">
                      {row.currency && row.currency !== session.currency ? `${row.currency} ` : ""}
                      {money(row.grand_total)}
                    </span>
                    <Pill cls="p-flat">{row.status || "—"}</Pill>
                  </span>
                </button>
              ))}
          </Card>
        </div>
      </div>

      <Card
        title={t("dash.failedLogs")}
        hint={<button type="button" className="btn quiet sm" onClick={() => nav("/e-invoice-log")}>{t("dash.viewAll")}</button>}
      >
        {failed.error && <ErrorBox error={failed.error} onRetry={() => failed.mutate()} />}
        {failed.isLoading ? <Loading />
          : failed.error ? null
          : (failed.data ?? []).length === 0 ? <Empty label={t("dash.noFailed")} />
          : (failed.data ?? []).map((row) => (
            <button
              type="button"
              key={row.name}
              className="qrow"
              onClick={() => {
                if (row.reference_doctype === DT.salesInvoice && row.reference_name) {
                  nav(`/invoices/${encodeURIComponent(row.reference_name)}`);
                } else {
                  nav("/e-invoice-log");
                }
              }}
            >
              <span>
                <span className="qtitle">{row.reference_name || row.name}</span>
                <span className="qsub">{row.name}</span>
              </span>
              <span className="qmeta">
                <Pill cls="p-overdue">{row.status || "—"}</Pill>
              </span>
            </button>
          ))}
      </Card>
    </>
  );
}
