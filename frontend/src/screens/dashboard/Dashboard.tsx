/**
 * Owner dashboard — design approved 21 Sep 2026 (claude/dashboard-scope.md).
 *
 * One server call (taxmate.api.owner_dashboard.get_owner_dashboard) carries
 * every figure. This screen only presents: the three views (Growth / Report /
 * Margin) are different readings of the same payload, so switching view never
 * refetches. Period and cost center do refetch, and live in the URL so a
 * filtered dashboard is a link.
 *
 * A section the user's role cannot read arrives as null and says so — it is
 * never drawn as zero, because a zero on a dashboard reads as a real figure.
 */

import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { date, money } from "../../lib/format";
import { getLocale } from "../../lib/i18n";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { SplitBar, Spark, TrendChart, whole } from "../../components/charts";
import AccountantDashboard from "./AccountantDashboard";
import { DashSwitch, useDashMode } from "./DashSwitch";
import "./dashboard.css";

/* ── Payload ─────────────────────────────────────────────────────────── */

type Flow = { value: number; count: number; prev: number; prev_count: number; by_month: number[] };
type Ageing = { total: number; overdue: number; buckets: number[] };
type Filing = {
  name: string; kind?: "vat" | "ct"; period_start?: string | null; period_end?: string | null;
  due_date: string; days: number | null; status?: string; amount: number;
};
type Payload = {
  company: string;
  currency: string;
  today: string;
  period: { key: Period; start: string; end: string; prev_start: string; prev_end: string };
  months: string[];
  cost_center: string | null;
  cost_centers: { name: string; label: string }[];
  pnl: null | {
    revenue: number; expenses: number; cogs: number;
    prev: { revenue: number; expenses: number; cogs: number };
    revenue_by_month: number[]; expenses_by_month: number[];
  };
  flows: { invoiced: Flow | null; bills: Flow | null; received: Flow | null; paid: Flow | null };
  bank: null | { total: number; accounts: { name: string; label: string; balance: number }[]; company_wide: boolean };
  vat: null | (Filing & { company_wide: boolean });
  ageing: { receivable: Ageing | null; payable: Ageing | null };
  budget: null | { rows: { account: string; label: string; budget: number; actual: number }[]; total_budget: number; total_actual: number };
  top_customers: { name: string; label: string; value: number }[];
  top_expenses: { account: string; label: string; value: number }[];
  overdue_invoices: { name: string; party: string; amount: number; currency?: string; due_date: string; days: number }[];
  bills_due: { name: string; party: string; amount: number; currency?: string; due_date: string; days: number }[];
  deadlines: Filing[];
  readiness: null | { done: number; total: number; missing: string[] };
};

type Period = "month" | "quarter" | "year";
type View = "growth" | "report" | "margin";
const PERIODS: Period[] = ["month", "quarter", "year"];
const VIEWS: View[] = ["growth", "report", "margin"];

/* ── Colours (tokens; see dashboard.css) ─────────────────────────────── */

const C = {
  rev: "var(--c-confirmed)",
  exp: "var(--c-draft)",
  profit: "var(--c-billed)",
  cashIn: "var(--c-delivered)",
  opex: "var(--od-age-3)",
  age: ["var(--od-age-0)", "var(--od-age-1)", "var(--od-age-2)", "var(--od-age-3)", "var(--od-age-4)"],
};

/* ── Small helpers ───────────────────────────────────────────────────── */

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

function pctText(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function deltaText(d: number | null): string {
  if (d == null) return "—";
  return `${d >= 0 ? "↑" : "↓"} ${pctText(Math.abs(d))}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(getLocale(), { month: "short" });
}

function periodLabel(p: Payload["period"]): string {
  const start = new Date(`${p.start}T00:00:00`);
  const loc = getLocale();
  const to = fill(t("od.toDate"), { d: new Date(`${p.end}T00:00:00`).toLocaleDateString(loc, { day: "numeric", month: "short" }) });
  if (p.key === "month") return `${start.toLocaleDateString(loc, { month: "long", year: "numeric" })} · ${to}`;
  if (p.key === "quarter") return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()} · ${to}`;
  return `${date(p.start)} – ${date(p.end)}`;
}

function filingPill(days: number | null): string {
  if (days == null) return "p-flat";
  if (days < 0) return "p-overdue";
  if (days <= 14) return "p-warn";
  return "p-open";
}

function daysText(days: number | null): string {
  if (days == null) return "—";
  if (days < 0) return t("dash.daysOverdue").replace("{n}", String(-days));
  if (days === 0) return t("dash.dueToday");
  if (days === 1) return t("od.dueTomorrow");
  return t("dash.dueIn").replace("{n}", String(days));
}

/* ── Screen ──────────────────────────────────────────────────────────── */

/** Home screen: the owner or the accountant view (see DashSwitch). */
export default function Dashboard() {
  return useDashMode() === "accountant" ? <AccountantDashboard /> : <OwnerDashboard />;
}

function OwnerDashboard() {
  const nav = useNavigate();
  const session = useSession();
  const [params, setParams] = useSearchParams();

  const period = (PERIODS.includes(params.get("period") as Period) ? params.get("period") : "month") as Period;
  const view = (VIEWS.includes(params.get("view") as View) ? params.get("view") : "growth") as View;
  const costCenter = params.get("cc") ?? "";

  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const res = useFrappeGetCall<{ message: Payload }>(
    METHOD.ownerDashboard,
    { period, cost_center: costCenter || undefined },
    session.user ? `owner-dashboard-${period}-${costCenter}` : null,
    { keepPreviousData: true },
  );
  const d = res.data?.message;
  const cur = d?.currency || session.currency || "";
  const firstName = (session.full_name || session.user || "").trim().split(/[\s@._-]/)[0];

  return (
    <div className="odash">
      <PageHead
        title={firstName ? `${t("dash.hello")}, ${firstName}` : t("nav.dashboard")}
        sub={session.company ? `${session.company} · ${date(session.today)}` : date(session.today)}
        actions={
          <>
            <DashSwitch />
            <button type="button" className="btn ghost" onClick={() => nav("/payments/new")}>{t("hub.receive")}</button>
            <button type="button" className="btn ghost" onClick={() => nav("/purchase-invoices/new")}>{t("od.newBill")}</button>
            <button type="button" className="btn" onClick={() => nav("/invoices/new")}>{t("hub.newSale")}</button>
          </>
        }
      />

      <div className="card od-filters">
        <div className="od-fgroup">
          <span className="od-flabel">{t("od.period")}</span>
          <div className="seg" role="group" aria-label={t("od.period")}>
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setParam("period", p, "month")}>
                {t(`od.p.${p}`)}
              </button>
            ))}
          </div>
          {d && <span className="od-plabel">{periodLabel(d.period)}</span>}
        </div>
        {(d?.cost_centers.length ?? 0) > 0 && (
          <div className="od-fgroup">
            <label className="od-flabel" htmlFor="od-cc">{t("od.costCenter")}</label>
            <select id="od-cc" className="ctl" value={costCenter} onChange={(e) => setParam("cc", e.target.value, "")}>
              <option value="">{t("od.allCc")}</option>
              {d!.cost_centers.map((c) => <option key={c.name} value={c.name}>{c.label}</option>)}
            </select>
          </div>
        )}
        <div className="od-fgroup od-push">
          <span className="od-flabel">{t("od.view")}</span>
          <div className="seg" role="group" aria-label={t("od.view")}>
            {VIEWS.map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setParam("view", v, "growth")}>
                {t(`od.v.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="od-hint">{t(`od.hint.${view}`)}</p>

      {res.error && <ErrorBox error={res.error} onRetry={() => res.mutate()} />}
      {!d && res.isLoading && <Loading />}
      {d && <Body d={d} view={view} cur={cur} busy={res.isValidating} />}
    </div>
  );
}

/* ── Body ────────────────────────────────────────────────────────────── */

function Body({ d, view, cur, busy }: { d: Payload; view: View; cur: string; busy: boolean }) {
  const nav = useNavigate();
  const months = d.months.map(monthLabel);
  const nMonths = d.period.key === "month" ? 1 : d.period.key === "quarter" ? monthsInQuarterToDate(d.period) : 12;
  const highlight = d.period.key === "year" ? [] : Array.from({ length: nMonths }, (_, i) => 11 - (nMonths - 1) + i);
  const scoped = !!d.cost_center;

  return (
    <div className={`od-body${busy ? " od-busy" : ""}`}>
      <div className="od-hero">
        <ProfitCard d={d} view={view} cur={cur} />
        <BankCard d={d} cur={cur} scoped={scoped} />
        <VatCard d={d} cur={cur} scoped={scoped} />
      </div>

      <FlowTiles d={d} view={view} cur={cur} />

      <div className="od-row od-row-2-1">
        <PnlCard d={d} view={view} cur={cur} months={months} highlight={highlight} />
        <CashCard d={d} cur={cur} months={months} highlight={highlight} />
      </div>

      <div className="od-row od-row-1-1">
        <AgeCard title={t("od.ar")} data={d.ageing.receivable} cur={cur} link={t("od.viewAr")} onLink={() => nav("/receivables")} />
        <AgeCard title={t("od.ap")} data={d.ageing.payable} cur={cur} link={t("od.viewAp")} onLink={() => nav("/payables")} />
      </div>

      <div className={`od-row ${d.budget ? "od-row-3" : "od-row-1-1"}`}>
        {d.budget && <BudgetCard budget={d.budget} cur={cur} />}
        <ShareCard
          title={t("od.topCust")}
          rows={d.top_customers.map((r) => ({ key: r.name, label: r.label, value: r.value }))}
          total={d.pnl?.revenue ?? d.flows.invoiced?.value ?? 0}
          of={t("od.ofRevenue")} colour={C.rev} cur={cur}
        />
        <ShareCard
          title={t("od.topExp")}
          rows={d.top_expenses.map((r) => ({ key: r.account, label: r.label, value: r.value }))}
          total={d.pnl?.expenses ?? 0}
          of={t("od.ofExpenses")} colour={C.exp} cur={cur}
        />
      </div>

      <div className="od-row od-row-1-1">
        <Card title={t("od.overdueInv")} hint={<button type="button" className="btn quiet sm" onClick={() => nav("/receivables")}>{t("dash.viewAll")}</button>}>
          <p className="od-cardsub">{fill(t("od.overdueSub"), { v: `${cur} ${whole(d.ageing.receivable?.overdue)}` })}</p>
          {d.overdue_invoices.length === 0 ? <Empty label={t("od.noOverdue")} /> : d.overdue_invoices.map((r) => (
            <button type="button" key={r.name} className="qrow" onClick={() => nav(`/invoices/${encodeURIComponent(r.name)}`)}>
              <span>
                <span className="qtitle">{r.name}</span>
                <span className="qsub">{r.party}</span>
              </span>
              <span className="qmeta">
                <Pill cls={r.days > 60 ? "p-overdue" : r.days > 30 ? "p-warn" : "p-open"}>{r.days === 1 ? t("od.dayLate") : fill(t("od.daysLate"), { n: r.days })}</Pill>
                <span className="qamt">{r.currency && r.currency !== cur ? `${r.currency} ` : ""}{money(r.amount)}</span>
              </span>
            </button>
          ))}
        </Card>
        <Card title={t("od.billsDue")} hint={<button type="button" className="btn quiet sm" onClick={() => nav("/payables")}>{t("dash.viewAll")}</button>}>
          <p className="od-cardsub">{t("od.billsSub")}</p>
          {d.bills_due.length === 0 ? <Empty label={t("od.noBills")} /> : d.bills_due.map((r) => (
            <button type="button" key={r.name} className="qrow" onClick={() => nav(`/purchase-invoices/${encodeURIComponent(r.name)}`)}>
              <span>
                <span className="qtitle">{r.name}</span>
                <span className="qsub">{r.party}</span>
              </span>
              <span className="qmeta">
                <Pill cls={r.days <= 1 ? "p-warn" : "p-open"}>{daysText(r.days)}</Pill>
                <span className="qamt">{r.currency && r.currency !== cur ? `${r.currency} ` : ""}{money(r.amount)}</span>
              </span>
            </button>
          ))}
        </Card>
      </div>

      <ComplianceStrip d={d} cur={cur} />
    </div>
  );
}

/** Months of the current quarter that have started (1–3). */
function monthsInQuarterToDate(p: Payload["period"]): number {
  const s = new Date(`${p.start}T00:00:00`), e = new Date(`${p.end}T00:00:00`);
  return (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1;
}

/* ── Hero row ────────────────────────────────────────────────────────── */

function ProfitCard({ d, view, cur }: { d: Payload; view: View; cur: string }) {
  const p = d.pnl;
  if (!p) {
    return (
      <section className="card od-pad">
        <span className="od-k">{t("od.np")}</span>
        <p className="od-note">{t("od.noLedger")}</p>
      </section>
    );
  }
  const np = p.revenue - p.expenses;
  const npPrev = p.prev.revenue - p.prev.expenses;
  const nm = p.revenue ? (np / p.revenue) * 100 : 0;
  const nmPrev = p.prev.revenue ? (npPrev / p.prev.revenue) * 100 : 0;
  const gm = p.revenue ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0;
  const opex = p.expenses - p.cogs;
  const dNp = change(np, npPrev);
  const pts = nm - nmPrev;

  return (
    <section className="card od-pad od-profit">
      <div className="od-profit-top">
        <div>
          <span className="od-k">{t("od.np")}</span>
          <div className="od-big"><span className="cur">{cur}</span>{whole(np)}</div>
        </div>
        {view === "growth" && (
          <div className="od-side">
            <span className={`od-chip ${dNp == null ? "" : dNp >= 0 ? "up" : "down"}`}>{deltaText(dNp)}</span>
            <span className="od-muted">{fill(t("od.vsPrev"), { v: `${cur} ${whole(npPrev)}` })}</span>
          </div>
        )}
        {view === "margin" && (
          <div className="od-side">
            <span className="od-big2">{pctText(nm)}</span>
            <span className="od-muted">{t("od.netMargin")} · {pts >= 0 ? "+" : "−"}{fill(t("od.pts"), { n: pctText(Math.abs(pts)).replace("%", "") })}</span>
            <span className="od-muted">{t("od.grossMargin")} {pctText(gm)}</span>
          </div>
        )}
        {view === "report" && (
          <div className="od-side">
            <span className="od-muted">{t("od.revenue")} <b>{cur} {whole(p.revenue)}</b></span>
            <span className="od-muted">{t("od.expenses")} <b>{cur} {whole(p.expenses)}</b></span>
          </div>
        )}
      </div>
      {p.revenue > 0 && (
        <div className="od-split">
          <span className="od-k">{t("od.split")}</span>
          <SplitBar
            ariaLabel={t("od.split")}
            segments={[
              { label: t("od.cogs"), value: p.cogs, colour: C.exp },
              { label: t("od.opex"), value: opex, colour: C.opex },
              { label: t("od.np"), value: Math.max(0, np), colour: C.profit },
            ]}
          />
          <div className="od-legend3">
            {[
              [t("od.cogs"), p.cogs, C.exp],
              [t("od.opex"), opex, C.opex],
              [t("od.np"), np, C.profit],
            ].map(([label, v, colour]) => (
              <div key={label as string}>
                <i className="sw" style={{ background: colour as string }} />
                <span>
                  <span className="od-muted">{label as string}</span>
                  <b className="num">{pctText(((v as number) / p.revenue) * 100)} · {whole(v as number)}</b>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BankCard({ d, cur, scoped }: { d: Payload; cur: string; scoped: boolean }) {
  const b = d.bank;
  return (
    <section className="card od-pad od-mini">
      <span className="od-k">{t("od.bank")} <span className="od-muted">· {t("od.today")}</span></span>
      {!b ? <p className="od-note">{t("od.noAccess")}</p> : b.accounts.length === 0 ? <p className="od-note">{t("od.noBank")}</p> : (
        <>
          <div className="od-big3"><span className="cur">{cur}</span>{whole(b.total)}</div>
          <div className="od-lines">
            {b.accounts.slice(0, 4).map((a) => (
              <div key={a.name}><span>{a.label}</span><b className="num">{whole(a.balance)}</b></div>
            ))}
          </div>
        </>
      )}
      {scoped && b && <p className="od-note">{t("od.companyWide")}</p>}
    </section>
  );
}

function VatCard({ d, cur, scoped }: { d: Payload; cur: string; scoped: boolean }) {
  const nav = useNavigate();
  const v = d.vat;
  const refund = !!v && v.amount < 0;
  return (
    <section className="card od-pad od-mini">
      <span className="od-k">{t("od.vat")}{v?.period_start ? ` · ${monthLabel(v.period_start.slice(0, 7))} ${v.period_start.slice(0, 4)}` : ""}</span>
      {!v ? <p className="od-note">{t("od.noVat")}</p> : (
        <>
          <div className="od-big3">
            <span className="cur">{cur}</span>{money(Math.abs(v.amount))}
            <Pill cls={refund ? "p-done" : "p-warn"}>{refund ? t("od.vatRefund") : t("od.vatPayable")}</Pill>
          </div>
          <p className="od-muted">{v.due_date ? `${date(v.due_date)} · ${daysText(v.days)}` : "—"}</p>
          <button type="button" className="btn quiet sm od-start" onClick={() => nav(`/vat-201/${encodeURIComponent(v.name)}`)}>{t("od.open")}</button>
        </>
      )}
      {scoped && v && <p className="od-note">{t("od.companyWide")}</p>}
    </section>
  );
}

/* ── Money tiles ─────────────────────────────────────────────────────── */

function FlowTiles({ d, view, cur }: { d: Payload; view: View; cur: string }) {
  const nav = useNavigate();
  const f = d.flows;
  const rev = f.invoiced?.value ?? 0;
  const gm = d.pnl && d.pnl.revenue ? ((d.pnl.revenue - d.pnl.cogs) / d.pnl.revenue) * 100 : null;
  const tiles: {
    key: keyof Payload["flows"]; colour: string; tint: string; upGood: boolean; to: string; icon: string; ratio: number | null;
  }[] = [
    { key: "invoiced", colour: C.rev, tint: "rgba(79,70,229,.12)", upGood: true, to: "/invoices", icon: '<path d="M4 2.5h7l3 3v10H4z"/><path d="M11 2.5v3h3M6.5 9.5h5M6.5 12.5h3.5"/>', ratio: gm },
    { key: "bills", colour: C.exp, tint: "rgba(217,119,6,.12)", upGood: false, to: "/purchase-invoices", icon: '<path d="M3 10l1.5-6.5h9L15 10v5H3z"/><path d="M3 10h4l1 1.5h2l1-1.5h4"/>', ratio: f.bills && rev ? (f.bills.value / rev) * 100 : null },
    { key: "received", colour: C.cashIn, tint: "rgba(8,145,178,.12)", upGood: true, to: "/payments?type=Receive", icon: '<path d="M9 3v8M6 8l3 3 3-3M4 15h10"/>', ratio: f.received && rev ? (f.received.value / rev) * 100 : null },
    { key: "paid", colour: C.opex, tint: "rgba(234,88,12,.11)", upGood: false, to: "/payments?type=Pay", icon: '<path d="M9 11V3M6 6l3-3 3 3M4 15h10"/>', ratio: f.paid && f.bills?.value ? (f.paid.value / f.bills.value) * 100 : null },
  ];

  return (
    <div className="tiles">
      {tiles.map((tl) => {
        const flow = f[tl.key];
        const dlt = flow ? change(flow.value, flow.prev) : null;
        return (
          <button key={tl.key} type="button" className="tilebtn" onClick={() => nav(tl.to)}>
            <div className="tile" style={{ ["--tint" as string]: tl.tint }}>
              <div className="row">
                <span className="bdg" style={{ background: tl.colour }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: tl.icon }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="k">{t(`od.${tl.key}`)}</span>
                  <div className="v"><small>{cur}</small> {flow ? whole(flow.value) : "—"}</div>
                </span>
                {view === "growth" && flow && <Spark values={flow.by_month} colour={tl.colour} />}
              </div>
              <div className="foot">
                {!flow ? t("od.noAccess")
                  : view === "growth" ? (
                    <>
                      <span className={`delta ${dlt == null ? "" : (dlt >= 0) === tl.upGood ? "up" : "down"}`}>{deltaText(dlt)}</span>
                      {fill(t("od.vsPrev"), { v: `${cur} ${whole(flow.prev)}` })}
                    </>
                  ) : view === "report" ? (
                    <>
                      <b>{fill(t(`od.cnt.${tl.key}`), { n: flow.count })}</b>
                      · {fill(t("od.prevWas"), { v: `${cur} ${whole(flow.prev)}` })}
                    </>
                  ) : (
                    <span className="od-ratio">
                      <span>{t(`od.r.${tl.key}`)} <b>{tl.ratio == null ? "—" : pctText(tl.ratio)}</b></span>
                      <span className="od-meter"><i style={{ width: `${Math.max(0, Math.min(100, tl.ratio ?? 0))}%`, background: tl.colour }} /></span>
                    </span>
                  )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Charts row ──────────────────────────────────────────────────────── */

function PnlCard({ d, view, cur, months, highlight }: {
  d: Payload; view: View; cur: string; months: string[]; highlight: number[];
}) {
  const p = d.pnl;
  const title = t(`od.chart.${view}`);
  if (!p) {
    return <Card title={title}><p className="od-note">{t("od.noLedger")}</p></Card>;
  }
  const profit = p.revenue_by_month.map((r, i) => r - p.expenses_by_month[i]);
  const margin = p.revenue_by_month.map((r, i) => (r ? (profit[i] / r) * 100 : 0));

  if (view === "report") {
    const np = p.revenue - p.expenses, npPrev = p.prev.revenue - p.prev.expenses;
    const gp = p.revenue - p.cogs, gpPrev = p.prev.revenue - p.prev.cogs;
    const nm = p.revenue ? (np / p.revenue) * 100 : 0, nmPrev = p.prev.revenue ? (npPrev / p.prev.revenue) * 100 : 0;
    const rows: [string, number, number, boolean][] = [
      [t("od.revenue"), p.revenue, p.prev.revenue, false],
      [t("od.cogs"), p.cogs, p.prev.cogs, false],
      [t("od.grossProfit"), gp, gpPrev, true],
      [t("od.opex"), p.expenses - p.cogs, p.prev.expenses - p.prev.cogs, false],
      [t("od.np"), np, npPrev, true],
    ];
    return (
      <Card title={title} hint={<span className="od-muted">{date(d.period.start)} – {date(d.period.end)} · {date(d.period.prev_start)} – {date(d.period.prev_end)}</span>}>
        <div className="od-pl">
          <div className="od-pl-h"><span>{t("od.pl.line")}</span><span>{t("od.pl.this")}</span><span>{t("od.pl.prev")}</span><span>{t("od.pl.change")}</span></div>
          {rows.map(([label, a, b, bold]) => (
            <div key={label} className={`od-pl-r${bold ? " b" : ""}`}>
              <span>{label}</span>
              <span className="num">{cur} {whole(a)}</span>
              <span className="num od-muted">{cur} {whole(b)}</span>
              <span className="num od-muted">{deltaText(change(a, b))}</span>
            </div>
          ))}
          <div className="od-pl-r">
            <span>{t("od.netMargin")}</span>
            <span className="num">{pctText(nm)}</span>
            <span className="num od-muted">{pctText(nmPrev)}</span>
            <span className="num od-muted">{nm - nmPrev >= 0 ? "+" : "−"}{fill(t("od.pts"), { n: pctText(Math.abs(nm - nmPrev)).replace("%", "") })}</span>
          </div>
        </div>
        <p className="od-note">{t("od.pl.note")}</p>
      </Card>
    );
  }

  const isMargin = view === "margin";
  return (
    <Card
      title={title}
      hint={
        <span className="od-legend">
          <span><i className="sw" style={{ background: C.rev }} />{t("od.revenue")}</span>
          <span><i className="sw" style={{ background: C.exp }} />{t("od.expenses")}</span>
          <span><i className="od-lsw" style={{ background: C.profit }} />{isMargin ? t("od.netMargin") : t("od.np")}</span>
        </span>
      }
    >
      <p className="od-cardsub">{t("od.chart.sub")}</p>
      <TrendChart
        ariaLabel={title}
        categories={months}
        highlight={highlight}
        bars={[
          { label: t("od.revenue"), colour: C.rev, values: p.revenue_by_month },
          { label: t("od.expenses"), colour: C.exp, values: p.expenses_by_month },
        ]}
        line={isMargin
          ? { label: t("od.netMargin"), colour: C.profit, values: margin, percent: true, format: pctText }
          : { label: t("od.np"), colour: C.profit, values: profit }}
      />
    </Card>
  );
}

function CashCard({ d, cur, months, highlight }: { d: Payload; cur: string; months: string[]; highlight: number[] }) {
  const inF = d.flows.received, outF = d.flows.paid;
  if (!inF || !outF) {
    return <Card title={t("od.cash")}><p className="od-note">{t("od.noAccess")}</p></Card>;
  }
  const last6 = <T,>(xs: T[]): T[] => xs.slice(-6);
  const net = inF.value - outF.value;
  return (
    <Card
      title={t("od.cash")}
      hint={
        <span className="od-legend">
          <span><i className="sw" style={{ background: C.cashIn }} />{t("od.in")}</span>
          <span><i className="sw" style={{ background: C.exp }} />{t("od.out")}</span>
        </span>
      }
    >
      <p className="od-cardsub">{t("od.cashSub")}</p>
      <TrendChart
        ariaLabel={t("od.cash")}
        width={360}
        height={250}
        categories={last6(months)}
        highlight={highlight.map((i) => i - 6).filter((i) => i >= 0)}
        bars={[
          { label: t("od.in"), colour: C.cashIn, values: last6(inF.by_month) },
          { label: t("od.out"), colour: C.exp, values: last6(outF.by_month) },
        ]}
      />
      <div className="od-net">
        <span className="od-muted">{t("od.net")}</span>
        <b className={`num ${net >= 0 ? "od-good" : "od-bad"}`}>{net >= 0 ? "+" : "−"} {cur} {whole(Math.abs(net))}</b>
      </div>
    </Card>
  );
}

/* ── Ageing, budget, shares ──────────────────────────────────────────── */

function AgeCard({ title, data, cur, link, onLink }: {
  title: string; data: Ageing | null; cur: string; link: string; onLink: () => void;
}) {
  const labels = [0, 1, 2, 3, 4].map((i) => t(`od.age.${i}`));
  return (
    <Card title={title} hint={<button type="button" className="btn quiet sm" onClick={onLink}>{link}</button>}>
      <p className="od-cardsub">{t("od.ageSub")}</p>
      {!data ? <p className="od-note">{t("od.noAccess")}</p> : data.total === 0 ? <Empty label={t("od.none")} /> : (
        <div className="od-age">
          <div className="od-age-top">
            <div><span className="od-k">{t("od.total")}</span><b className="od-val num">{cur} {whole(data.total)}</b></div>
            <div>
              <span className="od-k">{t("od.overdue")}</span>
              <b className="od-val num od-bad">{cur} {whole(data.overdue)}</b>
              <span className="od-muted"> ({pctText((data.overdue / data.total) * 100)})</span>
            </div>
          </div>
          <SplitBar ariaLabel={title} height={16} segments={data.buckets.map((v, i) => ({ label: labels[i], value: v, colour: C.age[i] }))} />
          <div className="od-age-grid">
            {data.buckets.map((v, i) => (
              <div key={i}>
                <span className="od-muted"><i className="sw" style={{ background: C.age[i] }} />{labels[i]}</span>
                <b className="num">{whole(v)}</b>
                <span className="od-muted num">{pctText((v / data.total) * 100)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function BudgetCard({ budget, cur }: { budget: NonNullable<Payload["budget"]>; cur: string }) {
  const tv = change(budget.total_actual, budget.total_budget);
  return (
    <Card
      title={t("od.budget")}
      hint={tv == null ? undefined : <Pill cls={tv > 0 ? "p-warn" : "p-done"}>{varianceText(tv)}</Pill>}
    >
      <p className="od-cardsub">{t("od.budgetSub")}</p>
      <div className="od-budget">
        {budget.rows.map((r) => {
          const v = change(r.actual, r.budget);
          const over = (v ?? 0) > 0.05;
          return (
            <div key={r.account}>
              <div className="od-brow">
                <span>{r.label}</span>
                <span className={over ? "od-warn" : "od-muted"}>{v == null ? "—" : varianceText(v)}</span>
              </div>
              <div className="od-btrack">
                <i style={{ width: `${Math.min(100, r.budget ? (r.actual / r.budget) * 80 : 0)}%`, background: over ? "var(--warn)" : "var(--brand)" }} />
                <b />
              </div>
              <span className="od-muted num">{fill(t("od.actualOf"), { a: `${cur} ${whole(r.actual)}`, b: whole(r.budget) })}</span>
            </div>
          );
        })}
      </div>
      <p className="od-note">{t("od.budgetLine")}</p>
    </Card>
  );
}

function varianceText(v: number): string {
  if (Math.abs(v) <= 0.05) return t("od.onBudget");
  return fill(t(v > 0 ? "od.over" : "od.under"), { n: pctText(Math.abs(v)).replace("%", "") });
}

function ShareCard({ title, rows, total, of, colour, cur }: {
  title: string; rows: { key: string; label: string; value: number }[]; total: number; of: string; colour: string; cur: string;
}) {
  const top = rows[0]?.value || 1;
  return (
    <Card title={title}>
      {rows.length === 0 ? <Empty label={t("od.none")} /> : (
        <div className="od-share">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="od-brow"><span className="od-ellip">{r.label}</span><b className="num">{cur} {whole(r.value)}</b></div>
              <div className="od-hb"><i style={{ width: `${(r.value / top) * 100}%`, background: colour }} /></div>
              {total > 0 && <span className="od-muted num">{pctText((r.value / total) * 100)} {of}</span>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ── Compliance ──────────────────────────────────────────────────────── */

function ComplianceStrip({ d, cur }: { d: Payload; cur: string }) {
  const nav = useNavigate();
  const r = d.readiness;
  const items = useMemo(() => d.deadlines.slice(0, 3), [d.deadlines]);
  return (
    <Card title={t("od.compliance")} bodyClass="od-cmp">
      {items.length === 0 && <div className="od-cmp-i"><p className="od-note">{t("od.noDeadlines")}</p></div>}
      {items.map((f) => (
        <button
          key={f.name} type="button" className="od-cmp-i"
          onClick={() => nav(f.kind === "ct" ? `/ct-filings/${encodeURIComponent(f.name)}` : `/vat-201/${encodeURIComponent(f.name)}`)}
        >
          <Pill cls={filingPill(f.days)}>{daysText(f.days)}</Pill>
          <b>{f.kind === "ct" ? t("od.k.ct") : t("od.k.vat")}</b>
          <span className="od-muted">
            {f.period_start && f.period_end ? `${date(f.period_start)} – ${date(f.period_end)}` : f.name}
          </span>
          <span className="num">
            {f.kind === "vat" && f.amount < 0
              ? `${t("od.vatRefund")} ${cur} ${money(-f.amount)}`
              : `${cur} ${money(f.amount)}`}
          </span>
        </button>
      ))}
      {r && (
        <button type="button" className="od-cmp-i" onClick={() => nav("/tax-settings")}>
          <Pill cls={r.done === r.total ? "p-done" : "p-warn"}>{r.done} / {r.total}</Pill>
          <b>{t("od.readiness")}</b>
          <span className="od-muted">
            {r.done === r.total ? t("od.readyAll") : fill(t("od.readyMissing"), { n: r.total - r.done })}
          </span>
          {r.missing.length > 0 && <span className="od-muted">{r.missing.join(" · ")}</span>}
        </button>
      )}
    </Card>
  );
}
