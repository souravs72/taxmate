/**
 * Accountant dashboard — design v1, 21 Sep 2026 (claude/dashboard-scope.md).
 *
 * Queues first, then the books. One server call
 * (taxmate.api.accountant_dashboard.get_accountant_dashboard) carries every
 * figure; this screen only presents it.
 *
 * Only the month-end close checklist and the VAT card follow the accounting
 * month picker (kept in the URL as ?month=YYYY-MM). Everything else is
 * company-wide and as of today, and the screen says so.
 *
 * A section the user's role cannot read arrives as null and says so — never
 * as zero.
 */

import { useNavigate, useSearchParams } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD, readableError } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { date, money } from "../../lib/format";
import { getLocale } from "../../lib/i18n";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { whole } from "../../components/charts";
import { DashSwitch } from "./DashSwitch";
import "./dashboard.css";
import "./accountant.css";

/* ── Payload ─────────────────────────────────────────────────────────── */

type Step = {
  key: "bank" | "drafts" | "payments" | "depreciation" | "stock" | "vat" | "suspense" | "lock";
  ok: boolean; na: boolean;
  n?: number; accounts?: number; total?: number; amount?: number; diff?: number;
  status?: string; name?: string | null; frozen_till?: string | null; ready?: boolean;
};
type Health = {
  key: "trial_balance" | "suspense" | "receivable" | "payable" | "stock" | "after_filing" | "bad_accounts" | "round_off";
  ok: boolean; na?: boolean; amount?: number; diff?: number; n?: number; limit?: number;
  items?: { doctype: string; name: string; posting_date: string; return: string }[];
};
type PartyAgeing = {
  rows: { party: string; label: string; buckets: number[]; total: number }[];
  others: null | { count: number; buckets: number[]; total: number };
  total: { buckets: number[]; total: number };
  parties: number;
};
type Payload = {
  company: string;
  currency: string;
  today: string;
  month: string;
  months: { key: string; start: string; end: string; state: "locked" | "open" | "unlocked"; vat_filed: boolean | null }[];
  queues: {
    drafts: null | { total: number; by_doctype: Record<string, number> };
    unallocated: null | { count: number; amount: number };
    bank: null | { count: number; accounts: number };
    einvoice: null | { count: number; rejected: number; failed: number };
    data: null | { count: number; checks: number };
    late: null | { count: number; amount: number; oldest_days: number | null };
  };
  close: { month: string; start: string; end: string; done: number; total: number; steps: Step[] };
  vat: null | {
    log: null | {
      name: string; period_start: string; period_end: string; due_date: string | null; days: number | null;
      status: string; filed: boolean; generated_on: string | null; in_progress: boolean;
    };
    month_end?: string;
    boxes?: { box: string; legend: string; amount: number; vat: number; subtotal: number }[];
    net?: number;
    ledger?: null | { net: number; accounts: number; diff: number };
  };
  health: Health[] | null;
  banks: null | {
    account: string; label: string; type: string; currency: string; mask: string; bank_account: string | null;
    balance: number; unreconciled: number | null; unreconciled_amount: number | null;
    last_statement: string | null; reconciled_to: string | null;
  }[];
  unallocated: null | {
    count: number; amount: number; oldest_days: number | null;
    rows: {
      name: string; type: string; party_type: string; party: string; party_name: string; date: string;
      days: number; reference: string | null; amount: number; open_docs: number;
    }[];
  };
  fixes: null | {
    since: string; count: number;
    checks: { key: string; severity: "bad" | "warn"; count: number; amount?: number; names: { shown: string[]; more: number }; route: string }[];
  };
  ageing: { receivable: PartyAgeing | null; payable: PartyAgeing | null };
  einvoice: null | {
    accepted: number; pending: number; rejected: number; failed: number;
    issues: { log: string; status: "Rejected" | "Failed"; doctype: string; name: string; error: string; retries: number; auto_retry: boolean }[];
  };
  activity: {
    doctype: string; name: string; verb: "submitted" | "cancelled" | "amended"; when: string; user: string;
    party: string | null; amount: number; posting_date: string | null; in_filed_period: string | null; frozen: boolean;
  }[];
  calendar: (
    | { kind: "vat" | "ct"; name: string; period_start: string | null; period_end: string | null; due_date: string; days: number | null; status?: string; amount: number; draft_status?: string }
    | { kind: "ubo"; name: string; status: string; last_reviewed: string | null; owners: number }
    | { kind: "readiness"; done: number; total: number; missing: string[] }
  )[];
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/** SPA route of a document; the SPA never links into ERPNext desk except where noted. */
const ROUTE: Record<string, string> = {
  "Sales Invoice": "/invoices",
  "Purchase Invoice": "/purchase-invoices",
  "Payment Entry": "/payments",
  "Journal Entry": "/journals",
};
const docRoute = (doctype: string, name: string) => (ROUTE[doctype] ? `${ROUTE[doctype]}/${encodeURIComponent(name)}` : null);

/** TaxMate SPA bank reconciliation route (Phase 14). */
const openBankRec = () => { window.location.href = "/taxmate/bank-reconciliation"; };

const AGE = ["var(--od-age-0)", "var(--od-age-1)", "var(--od-age-2)", "var(--od-age-3)", "var(--od-age-4)"];

function monthName(key: string, long = false): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(getLocale(), { month: long ? "long" : "short", year: "numeric" });
}

function daysText(days: number | null): string {
  if (days == null) return "—";
  if (days < 0) return t("dash.daysOverdue").replace("{n}", String(-days));
  if (days === 0) return t("dash.dueToday");
  if (days === 1) return t("od.dueTomorrow");
  return t("dash.dueIn").replace("{n}", String(days));
}

function duePill(days: number | null): string {
  if (days == null) return "p-flat";
  if (days < 0) return "p-overdue";
  if (days <= 14) return "p-warn";
  return "p-open";
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const amt = (cur: string, v: number) => `${cur} ${money(v)}`;

/* ── Screen ──────────────────────────────────────────────────────────── */

export default function AccountantDashboard() {
  const nav = useNavigate();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? "";

  const res = useFrappeGetCall<{ message: Payload }>(
    METHOD.accountantDashboard,
    { month: month || undefined },
    session.user ? `accountant-dashboard-${month}` : null,
    { keepPreviousData: true },
  );
  const d = res.data?.message;
  const cur = d?.currency || session.currency || "";
  const firstName = (session.full_name || session.user || "").trim().split(/[\s@._-]/)[0];
  const openQueues = d ? Object.values(d.queues).filter((q) => q && ("total" in q ? q.total : q.count) > 0).length : 0;

  const setMonth = (key: string, latest: string) => {
    const next = new URLSearchParams(params);
    if (key === latest) next.delete("month");
    else next.set("month", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="odash adash">
      <PageHead
        title={firstName ? `${t("dash.hello")}, ${firstName}` : t("nav.dashboard")}
        sub={[session.company, date(session.today), d ? (openQueues ? fill(t("ad.queuesOpen"), { n: openQueues }) : t("ad.queuesClear")) : ""].filter(Boolean).join(" · ")}
        actions={
          <>
            <DashSwitch />
            <button type="button" className="btn ghost" onClick={openBankRec}>{t("ad.reconcileBank")}</button>
            <button type="button" className="btn ghost" onClick={() => nav("/journals/new")}>{t("ad.journal")}</button>
            <button type="button" className="btn" onClick={() => nav("/invoices/new")}>＋ {t("hub.newSale")}</button>
          </>
        }
      />
      <p className="od-hint">{t("ad.hint")}</p>

      {res.error && <ErrorBox error={res.error} onRetry={() => res.mutate()} />}
      {!d && res.isLoading && <Loading />}
      {d && (
        <div className={`od-body${res.isValidating ? " od-busy" : ""}`}>
          <Queues d={d} cur={cur} />
          <MonthBar d={d} onPick={(k) => setMonth(k, d.months[d.months.length - 1].key)} />
          <div className="ad-row3">
            <CloseCard d={d} cur={cur} />
            <VatCard d={d} cur={cur} />
            <HealthCard health={d.health} cur={cur} />
          </div>
          <BankCard banks={d.banks} cur={cur} />
          <div className="od-row od-row-1-1">
            <UnallocCard data={d.unallocated} cur={cur} />
            <FixesCard data={d.fixes} cur={cur} />
          </div>
          <div className="od-row od-row-1-1">
            <PartyAgeCard title={t("ad.arByCustomer")} col={t("ad.customer")} data={d.ageing.receivable} base="/customers" link={t("od.viewAr")} to="/receivables" />
            <PartyAgeCard title={t("ad.apBySupplier")} col={t("ad.supplier")} data={d.ageing.payable} base="/suppliers" link={t("od.viewAp")} to="/payables" />
          </div>
          <div className="od-row od-row-1-1">
            <EInvoiceCard data={d.einvoice} onChange={() => void res.mutate()} />
            <ActivityCard rows={d.activity} cur={cur} />
          </div>
          <CalendarCard items={d.calendar} cur={cur} />
        </div>
      )}
    </div>
  );
}

/* ── Queue tiles ─────────────────────────────────────────────────────── */

function Queues({ d, cur }: { d: Payload; cur: string }) {
  const nav = useNavigate();
  const q = d.queues;
  const draftsTo = (() => {
    const by = q.drafts?.by_doctype ?? {};
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0 ? ROUTE[top[0]] : "/invoices";
  })();
  const draftParts = q.drafts
    ? Object.entries(q.drafts.by_doctype).filter(([, n]) => n > 0).map(([dt, n]) => `${t(`ad.dt.${dt}`)} ${n}`).join(" · ")
    : "";

  const tiles: { key: string; tone: "warn" | "bad" | "info"; value: number | null; label: string; sub: string; cta: string; go: () => void; icon: string }[] = [
    {
      key: "drafts", tone: "warn", value: q.drafts?.total ?? null, label: t("ad.q.drafts"),
      sub: q.drafts ? (draftParts || t("ad.none")) : t("od.noAccess"), cta: t("ad.q.draftsGo"), go: () => nav(draftsTo),
      icon: '<path d="M4 2.5h7l3 3v10H4z"/><path d="M11 2.5v3h3M6.5 9.5h5M6.5 12.5h3.5"/>',
    },
    {
      key: "unalloc", tone: "warn", value: q.unallocated?.count ?? null, label: t("ad.q.unalloc"),
      sub: q.unallocated ? fill(t("ad.q.unallocSub"), { v: amt(cur, q.unallocated.amount) }) : t("od.noAccess"),
      cta: t("ad.q.unallocGo"), go: () => scrollTo("ad-unalloc"),
      icon: '<rect x="2.5" y="4.5" width="13" height="9" rx="1.5"/><path d="M2.5 8h13"/>',
    },
    {
      key: "bank", tone: "bad", value: q.bank?.count ?? null, label: t("ad.q.bank"),
      sub: q.bank ? fill(t("ad.q.bankSub"), { n: q.bank.accounts }) : t("od.noAccess"),
      cta: t("ad.q.bankGo"), go: () => scrollTo("ad-bank"),
      icon: '<path d="M2.5 7L9 3l6.5 4M4 8v5M7.3 8v5M10.7 8v5M14 8v5M2.5 15h13"/>',
    },
    {
      key: "einv", tone: "bad", value: q.einvoice?.count ?? null, label: t("ad.q.einv"),
      sub: q.einvoice ? fill(t("ad.q.einvSub"), { r: q.einvoice.rejected, f: q.einvoice.failed }) : t("od.noAccess"),
      cta: t("ad.q.einvGo"), go: () => scrollTo("ad-einv"),
      icon: '<circle cx="9" cy="9" r="6.5"/><path d="M9 5.5v4M9 12.3v.2"/>',
    },
    {
      key: "data", tone: "warn", value: q.data?.count ?? null, label: t("ad.q.data"),
      sub: q.data ? fill(t("ad.q.dataSub"), { n: q.data.checks }) : t("od.noAccess"),
      cta: t("ad.q.dataGo"), go: () => scrollTo("ad-fixes"),
      icon: '<path d="M11.5 3.5a3 3 0 00-3.9 3.9L3 12l3 3 4.6-4.6a3 3 0 003.9-3.9l-2 2-2-.5-.5-2z"/>',
    },
    {
      key: "late", tone: "info", value: q.late?.count ?? null, label: fill(t("ad.q.late"), { n: 60 }),
      sub: q.late ? (q.late.count ? fill(t("ad.q.lateSub"), { v: amt(cur, q.late.amount), n: q.late.oldest_days ?? 0 }) : t("ad.none")) : t("od.noAccess"),
      cta: t("ad.q.lateGo"), go: () => nav("/receivables"),
      icon: '<circle cx="9" cy="9" r="6.5"/><path d="M9 5.5V9l2.5 1.5"/>',
    },
  ];

  return (
    <div className="ad-queues">
      {tiles.map((tl) => {
        const clear = tl.value === 0;
        return (
          <button key={tl.key} type="button" className={`ad-q ad-q-${clear ? "ok" : tl.tone}`} onClick={tl.go} disabled={tl.value == null}>
            <span className="ad-q-top">
              <span className="ad-q-ic">
                <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"
                  strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: tl.icon }} />
              </span>
              <span className="ad-q-n">{tl.value ?? "—"}</span>
            </span>
            <span className="ad-q-l">{tl.label}</span>
            <span className="ad-q-s">{tl.sub}</span>
            {tl.value ? <span className="ad-q-go">{tl.cta} →</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Accounting month ────────────────────────────────────────────────── */

function MonthBar({ d, onPick }: { d: Payload; onPick: (key: string) => void }) {
  const m = d.months.find((x) => x.key === d.month) ?? d.months[d.months.length - 1];
  const end = new Date(`${m.end}T00:00:00`);
  const today = new Date(`${d.today}T00:00:00`);
  const left = Math.round((end.getTime() - today.getTime()) / 86400000);
  return (
    <div className="card ad-month">
      <span className="od-flabel">{t("ad.period")}</span>
      <div className="seg" role="group" aria-label={t("ad.period")}>
        {d.months.map((x) => (
          <button key={x.key} type="button" aria-pressed={x.key === d.month} onClick={() => onPick(x.key)}>
            <span className={`ad-dot ad-dot-${x.state}`} aria-hidden="true" />
            {monthName(x.key)}
          </button>
        ))}
      </div>
      <span className="ad-month-t">
        {m.state === "locked" ? t("ad.m.locked") : m.state === "open" ? fill(t("ad.m.open"), { n: Math.max(left, 0) }) : t("ad.m.unlocked")}
      </span>
      <span className="ad-month-note">{t("ad.m.note")}</span>
      <Pill cls={m.state === "locked" ? "p-done" : m.state === "open" ? "p-open" : "p-warn"}>{t(`ad.m.state.${m.state}`)}</Pill>
    </div>
  );
}

/* ── Month-end close ─────────────────────────────────────────────────── */

function stepText(s: Step, cur: string): { title: string; sub: string } {
  const title = t(`ad.c.${s.key}`);
  if (s.na) return { title, sub: t(`ad.c.${s.key}.na`) };
  switch (s.key) {
    case "bank": return { title, sub: s.ok ? t("ad.c.bank.ok") : fill(t("ad.c.bank.todo"), { n: s.n ?? 0, a: s.accounts ?? 0 }) };
    case "drafts": return { title, sub: s.ok ? t("ad.c.drafts.ok") : fill(t("ad.c.drafts.todo"), { n: s.n ?? 0 }) };
    case "payments": return { title, sub: s.ok ? t("ad.c.payments.ok") : fill(t("ad.c.payments.todo"), { n: s.n ?? 0, v: amt(cur, s.amount ?? 0) }) };
    case "depreciation": return { title, sub: s.ok ? t("ad.c.depreciation.ok") : fill(t("ad.c.depreciation.todo"), { n: s.n ?? 0, v: amt(cur, s.amount ?? 0) }) };
    case "stock": return { title, sub: s.ok ? t("ad.c.stock.ok") : fill(t("ad.c.stock.todo"), { v: amt(cur, s.diff ?? 0) }) };
    case "vat": return { title, sub: s.ok ? fill(t("ad.c.vat.ok"), { s: s.status ?? "" }) : t("ad.c.vat.todo") };
    case "suspense": return { title, sub: s.ok ? t("ad.c.suspense.ok") : fill(t("ad.c.suspense.todo"), { v: amt(cur, s.amount ?? 0) }) };
    case "lock": return {
      title,
      sub: s.ok ? fill(t("ad.c.lock.ok"), { d: date(s.frozen_till) }) : s.ready ? t("ad.c.lock.ready") : t("ad.c.lock.todo"),
    };
  }
}

function CloseCard({ d, cur }: { d: Payload; cur: string }) {
  const nav = useNavigate();
  const writer = canWrite(useSession());
  const c = d.close;
  const draftsTo = (() => {
    const by = d.queues.drafts?.by_doctype ?? {};
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0 ? ROUTE[top[0]] : "/invoices";
  })();
  const action = (s: Step): { label: string; go: () => void } | null => {
    if (s.ok) return null;
    switch (s.key) {
      case "bank": return { label: t("ad.a.reconcile"), go: openBankRec };
      case "drafts": return { label: t("ad.a.review"), go: () => nav(draftsTo) };
      case "payments": return { label: t("ad.a.allocate"), go: () => scrollTo("ad-unalloc") };
      case "vat": return { label: t("ad.a.generate"), go: () => nav("/vat-201/new") };
      case "suspense": return { label: t("ad.a.open"), go: () => nav("/accounts") };
      default: return null;
    }
  };
  const pct = c.total ? (c.done / c.total) * 100 : 0;
  return (
    <section className="card ad-close">
      <div className="chead">
        <h2>{fill(t("ad.close"), { m: monthName(c.month, true) })}</h2>
        <span className="ad-count"><b>{c.done}</b> / {c.total}</span>
      </div>
      <div className="ad-progress" role="progressbar" aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.done}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="od-cardsub ad-pad">
        {c.done === c.total ? t("ad.close.done") : fill(t("ad.close.left"), { n: c.total - c.done })}
      </p>
      <div>
        {c.steps.map((s) => {
          const tx = stepText(s, cur);
          const a = action(s);
          return (
            <div key={s.key} className="ad-step">
              <span className={`ad-mark ${s.ok ? "ok" : "todo"}`} aria-label={s.ok ? t("ad.done") : t("ad.todo")}>{s.ok ? "✓" : "!"}</span>
              <span className="ad-step-t">
                <b>{tx.title}</b>
                <span>{tx.sub}</span>
              </span>
              {a && writer && <button type="button" className="btn ghost sm" onClick={a.go}>{a.label}</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── VAT 201 ─────────────────────────────────────────────────────────── */

function VatCard({ d, cur }: { d: Payload; cur: string }) {
  const nav = useNavigate();
  const writer = canWrite(useSession());
  const v = d.vat;
  if (!v) {
    return <Card title={t("ad.vat")}><p className="od-note">{t("od.noAccess")}</p></Card>;
  }
  if (!v.log) {
    return (
      <Card title={fill(t("ad.vatFor"), { m: monthName(d.month, true) })}>
        <Empty label={t("ad.vat.none")} />
        {writer && <button type="button" className="btn ghost sm" onClick={() => nav("/vat-201/new")}>{t("ad.a.generate")}</button>}
      </Card>
    );
  }
  const log = v.log;
  // Boxes 1a–1g are the emirates; 12–14 repeat 8 and 11 and end in the payable line below.
  const isEmirate = (box: string) => /^1[a-g]$/.test(box);
  const boxes = (v.boxes ?? []).filter((b) => {
    if (isEmirate(b.box)) return b.amount || b.vat;
    if (["2", "6", "7", "10"].includes(b.box)) return b.amount || b.vat;
    return ["3", "4", "5", "8", "9", "11"].includes(b.box);
  });
  const emirateRows = boxes.filter((b) => isEmirate(b.box));
  const net = v.net ?? 0;
  const ledger = v.ledger;
  const status = log.filed ? "p-done" : log.status === "Reviewed" ? "p-open" : "p-draft";

  return (
    <section className="card">
      <div className="chead">
        <h2>{t("ad.vat")} · {date(log.period_start)} – {date(log.period_end)}</h2>
        <Pill cls={status}>{log.filed ? t("ad.vat.filed") : log.status}</Pill>
      </div>
      <p className="od-cardsub ad-pad ad-pt">
        {log.in_progress ? t("ad.vat.inProgress") : log.filed ? t("ad.vat.isFiled") : t("ad.vat.toFile")}
      </p>
      <div className="ad-tbl ad-tbl-vat" role="table" aria-label={t("ad.vat")}>
        <div className="tr" role="row">
          <span className="th" role="columnheader">{t("ad.vat.box")}</span>
          <span className="th" role="columnheader">{fill(t("ad.vat.amount"), { c: cur })}</span>
          <span className="th" role="columnheader">{fill(t("ad.vat.vat"), { c: cur })}</span>
        </div>
        {emirateRows.length === 0 && (
          <div className="tr zero" role="row">
            <span className="td" role="cell">1 · {t("ad.vat.standard")}</span>
            <span className="td" role="cell">0.00</span>
            <span className="td" role="cell">0.00</span>
          </div>
        )}
        {boxes.map((b) => {
          const label = isEmirate(b.box) ? `${b.box} · ${(b.legend ?? "").replace(/^Standard rated supplies in /, "")}` : `${b.box} · ${t(`ad.vat.b${b.box}`)}`;
          const zero = !b.amount && !b.vat;
          return (
            <div key={b.box} className={`tr${b.subtotal ? " tot" : ""}${zero && !b.subtotal ? " zero" : ""}`} role="row">
              <span className="td" role="cell" title={b.legend}>{label}</span>
              <span className="td" role="cell">{b.subtotal && !b.amount ? "" : money(b.amount)}</span>
              <span className="td" role="cell">{["4", "5"].includes(b.box) ? "—" : money(b.vat)}</span>
            </div>
          );
        })}
      </div>
      <div className="ad-vat-foot">
        <div className="ad-vat-net">
          <b>14 · {net >= 0 ? t("ad.vat.payable") : t("ad.vat.refundable")}</b>
          <span className="od-big2">{cur} {money(Math.abs(net))}</span>
        </div>
        {ledger && (
          <p className={`ad-ledger ${ledger.accounts && Math.abs(ledger.diff) <= 0.5 ? "ok" : "warn"}`}>
            {ledger.accounts === 0
              ? t("ad.vat.noAccounts")
              : Math.abs(ledger.diff) <= 0.5
                ? fill(t("ad.vat.ledgerOk"), { v: amt(cur, ledger.net) })
                : fill(t("ad.vat.ledgerDiff"), { v: amt(cur, ledger.net), d: amt(cur, ledger.diff) })}
          </p>
        )}
        <p className="od-note">
          {log.due_date ? `${t("ad.vat.due")} ${date(log.due_date)} · ${daysText(log.days)}` : ""}
        </p>
        <button type="button" className="btn quiet sm od-start" onClick={() => nav(`/vat-201/${encodeURIComponent(log.name)}`)}>{t("ad.vat.open")} →</button>
      </div>
    </section>
  );
}

/* ── Ledger health ───────────────────────────────────────────────────── */

function healthText(h: Health, cur: string): string {
  switch (h.key) {
    case "trial_balance": return h.ok ? fill(t("ad.h.tb.ok"), { v: amt(cur, h.amount ?? 0) }) : fill(t("ad.h.tb.bad"), { v: amt(cur, h.diff ?? 0) });
    case "suspense": return h.na ? t("ad.h.suspense.na") : h.ok ? t("ad.h.zero") : fill(t("ad.h.suspense.bad"), { v: amt(cur, h.amount ?? 0), n: h.n ?? 0 });
    case "receivable":
    case "payable":
    case "stock": return h.ok ? t("ad.h.diffZero") : fill(t("ad.h.diff"), { v: amt(cur, h.diff ?? 0) });
    case "after_filing": return h.ok ? t("ad.h.none") : fill(t("ad.h.after.bad"), { n: h.n ?? 0 });
    case "bad_accounts": return h.ok ? t("ad.h.none") : fill(t("ad.h.bad.bad"), { n: h.n ?? 0 });
    case "round_off": return fill(h.ok ? t("ad.h.ro.ok") : t("ad.h.ro.bad"), { v: amt(cur, h.amount ?? 0), l: money(h.limit ?? 0) });
  }
}

function HealthCard({ health, cur }: { health: Health[] | null; cur: string }) {
  const nav = useNavigate();
  if (!health) return <Card title={t("ad.health")}><p className="od-note">{t("od.noAccess")}</p></Card>;
  const bad = health.filter((h) => !h.ok).length;
  return (
    <section className="card">
      <div className="chead">
        <h2>{t("ad.health")}</h2>
        <Pill cls={bad ? "p-overdue" : "p-done"}>{bad ? fill(t("ad.h.toFix"), { n: bad }) : t("ad.h.allClear")}</Pill>
      </div>
      <p className="od-cardsub ad-pad ad-pt">{t("ad.h.sub")}</p>
      <div>
        {health.map((h) => (
          <div key={h.key} className="ad-hrow">
            <span className={`ad-hdot ${h.ok ? "ok" : "bad"}`} aria-hidden="true" />
            <span className="ad-step-t">
              <b>{t(`ad.h.${h.key}`)}</b>
              <span className={h.ok ? "" : "od-bad"}>{healthText(h, cur)}</span>
              {h.key === "after_filing" && !h.ok && (h.items ?? []).map((it) => {
                const r = docRoute(it.doctype, it.name);
                return r
                  ? <button key={it.name} type="button" className="ad-link mono" onClick={() => nav(r)}>{it.name} · {date(it.posting_date)}</button>
                  : <span key={it.name} className="mono">{it.name} · {date(it.posting_date)}</span>;
              })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Bank reconciliation ─────────────────────────────────────────────── */

function BankCard({ banks, cur }: { banks: Payload["banks"]; cur: string }) {
  const nav = useNavigate();
  return (
    <section className="card" id="ad-bank">
      <div className="chead">
        <h2>{t("ad.bank")}</h2>
        <span className="hint">{t("ad.bank.sub")}</span>
      </div>
      {!banks ? <div className="cbody"><p className="od-note">{t("od.noAccess")}</p></div>
        : banks.length === 0 ? <Empty label={t("ad.bank.none")} />
        : (
          <div className="ad-scroll">
            <div className="ad-tbl ad-tbl-bank" role="table" aria-label={t("ad.bank")}>
              <div className="tr" role="row">
                <span className="th" role="columnheader">{t("ad.bank.account")}</span>
                <span className="th" role="columnheader">{t("ad.bank.book")}</span>
                <span className="th" role="columnheader">{t("ad.bank.lines")}</span>
                <span className="th" role="columnheader">{t("ad.bank.openAmt")}</span>
                <span className="th" role="columnheader">{t("ad.bank.last")}</span>
                <span className="th" role="columnheader">{t("ad.bank.to")}</span>
                <span className="th" role="columnheader"><span className="sr">{t("ad.action")}</span></span>
              </div>
              {banks.map((b) => {
                const isCash = b.type === "Cash" || !b.bank_account;
                const open = b.unreconciled ?? 0;
                return (
                  <div key={b.account} className="tr" role="row">
                    <span className="td" role="cell">
                      <b className="ad-ellip">{b.label}{b.mask && <span className="mono od-muted"> ••{b.mask}</span>}</b>
                      <span className="od-muted ad-ellip">{isCash ? (b.type === "Cash" ? t("ad.bank.cash") : t("ad.bank.noLink")) : fill(t("ad.bank.linked"), { n: b.bank_account ?? "" })}</span>
                    </span>
                    <span className="td" role="cell">{b.currency && b.currency !== cur ? `${b.currency} ` : ""}{money(b.balance)}</span>
                    <span className={`td ${open ? "od-bad" : "od-good"}`} role="cell">{isCash || b.unreconciled == null ? "—" : open}</span>
                    <span className={`td ${b.unreconciled_amount ? "od-bad" : ""}`} role="cell">{isCash || b.unreconciled_amount == null ? "—" : money(b.unreconciled_amount)}</span>
                    <span className="td" role="cell">{b.last_statement ? date(b.last_statement) : "—"}</span>
                    <span className="td" role="cell">{b.reconciled_to ? date(b.reconciled_to) : "—"}</span>
                    <span className="td" role="cell">
                      {isCash
                        ? <button type="button" className="btn ghost sm" onClick={() => nav(`/accounts/${encodeURIComponent(b.account)}`)}>{t("ad.a.ledger")}</button>
                        : <button type="button" className="btn ghost sm" onClick={openBankRec}>{open ? t("ad.a.reconcile") : t("ad.a.view")} ↗</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      <p className="od-note ad-pad ad-pb">{t("ad.bank.note")}</p>
    </section>
  );
}

/* ── Unallocated payments ────────────────────────────────────────────── */

function UnallocCard({ data, cur }: { data: Payload["unallocated"]; cur: string }) {
  const nav = useNavigate();
  return (
    <section className="card" id="ad-unalloc">
      <div className="chead">
        <h2>{t("ad.unalloc")}</h2>
        <button type="button" className="btn quiet sm" onClick={() => nav("/payments")}>{t("dash.viewAll")}</button>
      </div>
      {!data ? <div className="cbody"><p className="od-note">{t("od.noAccess")}</p></div>
        : data.count === 0 ? <Empty label={t("ad.unalloc.none")} />
        : (
          <>
            <p className="od-cardsub ad-pad ad-pt">
              {fill(t("ad.unalloc.sub"), { n: data.count, v: amt(cur, data.amount), d: data.oldest_days ?? 0 })}
            </p>
            {data.rows.map((r) => (
              <button type="button" key={r.name} className="ad-li" onClick={() => nav(`/payments/${encodeURIComponent(r.name)}`)}>
                <Pill cls={r.type === "Receive" ? "p-open" : "p-flat"}>{r.type === "Receive" ? t("ad.received") : t("ad.paid")}</Pill>
                <span className="ad-li-t">
                  <b className="ad-ellip">{r.party_name}</b>
                  <span className="od-muted">
                    <span className="mono">{r.name}</span> · {date(r.date)}
                    {r.reference ? ` · ${t("ad.ref")} ${r.reference}` : ""}
                    {" · "}{r.open_docs
                      ? fill(t(r.party_type === "Customer" ? "ad.openInv" : "ad.openBills"), { n: r.open_docs })
                      : t(r.party_type === "Customer" ? "ad.advance" : "ad.advancePaid")}
                  </span>
                </span>
                <span className="ad-li-a">{amt(cur, r.amount)}</span>
              </button>
            ))}
            {data.count > data.rows.length && <p className="od-note ad-pad ad-pb">{fill(t("ad.more"), { n: data.count - data.rows.length })}</p>}
          </>
        )}
    </section>
  );
}

/* ── Data to fix ─────────────────────────────────────────────────────── */

function FixesCard({ data, cur }: { data: Payload["fixes"]; cur: string }) {
  const nav = useNavigate();
  return (
    <section className="card" id="ad-fixes">
      <div className="chead">
        <h2>{t("ad.fixes")}</h2>
        {data && <span className="hint">{fill(t("ad.fixes.since"), { d: date(data.since) })}</span>}
      </div>
      {!data ? <div className="cbody"><p className="od-note">{t("od.noAccess")}</p></div>
        : (
          <>
            <p className="od-cardsub ad-pad ad-pt">{data.count ? t("ad.fixes.sub") : t("ad.fixes.clean")}</p>
            {data.checks.map((c) => {
              const names = c.names.shown.join(", ") + (c.names.more ? ` +${c.names.more}` : "");
              return (
                <div key={c.key} className="ad-li static">
                  <span className={`ad-badge ${c.count === 0 ? "ok" : c.severity}`}>{c.count}</span>
                  <span className="ad-li-t">
                    <b>{t(`ad.f.${c.key}`)}</b>
                    <span className="od-muted">
                      {c.count === 0 ? t("ad.f.clear") : [
                        c.key === "supplier_trn" && c.amount ? fill(t("ad.f.blocked"), { v: amt(cur, c.amount) }) : t(`ad.f.${c.key}.why`),
                        names,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {c.count > 0 && <button type="button" className="btn ghost sm" onClick={() => nav(c.route)}>{t(`ad.f.${c.key}.go`)}</button>}
                </div>
              );
            })}
          </>
        )}
    </section>
  );
}

/* ── Ageing by party ─────────────────────────────────────────────────── */

function PartyAgeCard({ title, col, data, base, link, to }: {
  title: string; col: string; data: PartyAgeing | null; base: string; link: string; to: string;
}) {
  const nav = useNavigate();
  const cell = (v: number, i: number) => (
    <span key={i} className={`td${!v ? " od-muted" : i >= 3 ? " od-bad" : ""}`} role="cell">{v ? whole(v) : "—"}</span>
  );
  return (
    <section className="card">
      <div className="chead">
        <h2>{title}</h2>
        <button type="button" className="btn quiet sm" onClick={() => nav(to)}>{link}</button>
      </div>
      {!data ? <div className="cbody"><p className="od-note">{t("od.noAccess")}</p></div>
        : data.parties === 0 ? <Empty label={t("ad.age.none")} />
        : (
          <>
            <p className="od-cardsub ad-pad ad-pt">{t("ad.age.sub")}</p>
            <div className="ad-scroll">
              <div className="ad-tbl ad-tbl-age" role="table" aria-label={title}>
                <div className="tr" role="row">
                  <span className="th" role="columnheader">{col}</span>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="th" role="columnheader"><span className="sw" style={{ background: AGE[i] }} />{t(`ad.age.${i}`)}</span>
                  ))}
                  <span className="th" role="columnheader">{t("ad.total")}</span>
                </div>
                {data.rows.map((r) => (
                  // A row can't be a <button> (role="row" would strip its button semantics):
                  // the row takes mouse clicks, the party name is the keyboard/AT control.
                  <div key={r.party} className="tr ad-rowbtn" role="row" onClick={() => nav(`${base}/${encodeURIComponent(r.party)}`)}>
                    <span className="td ad-ellip" role="cell" title={r.label}>
                      <button type="button" className="ad-rowlink ad-ellip">{r.label}</button>
                    </span>
                    {r.buckets.map(cell)}
                    <span className="td b" role="cell">{whole(r.total)}</span>
                  </div>
                ))}
                {data.others && (
                  <div className="tr" role="row">
                    <span className="td" role="cell">{fill(t("ad.age.others"), { n: data.others.count })}</span>
                    {data.others.buckets.map(cell)}
                    <span className="td b" role="cell">{whole(data.others.total)}</span>
                  </div>
                )}
                <div className="tr tot" role="row">
                  <span className="td" role="cell">{t("ad.total")}</span>
                  {data.total.buckets.map((v, i) => <span key={i} className={`td${v && i >= 3 ? " od-bad" : ""}`} role="cell">{v ? whole(v) : "—"}</span>)}
                  <span className="td" role="cell">{whole(data.total.total)}</span>
                </div>
              </div>
            </div>
          </>
        )}
    </section>
  );
}

/* ── E-invoicing ─────────────────────────────────────────────────────── */

function EInvoiceCard({ data, onChange }: { data: Payload["einvoice"]; onChange: () => void }) {
  const nav = useNavigate();
  const session = useSession();
  const retry = useFrappePostCall(METHOD.generateEInvoice);
  const counts: { key: "accepted" | "pending" | "rejected" | "failed"; cls: string }[] = [
    { key: "accepted", cls: "ok" }, { key: "pending", cls: "info" }, { key: "rejected", cls: "bad" }, { key: "failed", cls: "warn" },
  ];
  return (
    <section className="card" id="ad-einv">
      <div className="chead">
        <h2>{t("ad.einv")}</h2>
        <button type="button" className="btn quiet sm" onClick={() => nav("/e-invoice-log")}>{t("ad.einv.log")}</button>
      </div>
      {!data ? <div className="cbody"><p className="od-note">{t("od.noAccess")}</p></div> : (
        <>
          <div className="ad-einv-counts">
            {counts.map((c) => (
              <div key={c.key}>
                <span className="od-muted"><span className={`ad-hdot ${c.cls}`} aria-hidden="true" />{t(`ad.einv.${c.key}`)}</span>
                <b>{data[c.key]}</b>
              </div>
            ))}
          </div>
          {retry.error && <p className="od-bad ad-pad">{readableError(retry.error)}</p>}
          {data.issues.length === 0 ? <Empty label={t("ad.einv.none")} /> : data.issues.map((e) => {
            const r = docRoute(e.doctype, e.name);
            return (
              <div key={e.log} className="ad-li static">
                <Pill cls={e.status === "Rejected" ? "p-overdue" : "p-warn"}>{t(`ad.einv.${e.status.toLowerCase()}1`)}</Pill>
                <span className="ad-li-t">
                  <b className="mono">{e.name}</b>
                  {e.error && <span className="od-muted ad-clamp">{e.error}</span>}
                  <span className="ad-fix">
                    {e.status === "Rejected" ? t("ad.einv.fixRejected") : e.auto_retry ? fill(t("ad.einv.fixAuto"), { n: e.retries }) : t("ad.einv.fixManual")}
                  </span>
                </span>
                {e.status === "Failed" && e.doctype === DT.salesInvoice && canWrite(session)
                  ? <button type="button" className="btn ghost sm" disabled={retry.loading}
                      onClick={() => void retry.call({ docname: e.name, doctype: e.doctype }).then(onChange).catch(() => undefined)}>
                      {t("ad.a.retry")}
                    </button>
                  : r && <button type="button" className="btn ghost sm" onClick={() => nav(r)}>{t("ad.a.open")}</button>}
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

/* ── Recent activity ─────────────────────────────────────────────────── */

function initials(name: string): string {
  return name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function whenText(iso: string, today: string): string {
  const at = new Date(iso.replace(" ", "T"));
  const time = at.toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
  if (iso.slice(0, 10) === today) return time;
  return `${at.toLocaleDateString(getLocale(), { day: "numeric", month: "short" })} · ${time}`;
}

function ActivityCard({ rows, cur }: { rows: Payload["activity"]; cur: string }) {
  const nav = useNavigate();
  const session = useSession();
  const today = session.today ?? "";
  return (
    <section className="card">
      <div className="chead">
        <h2>{t("ad.activity")}</h2>
        <span className="hint">{t("ad.activity.sub")}</span>
      </div>
      {rows.length === 0 ? <Empty label={t("ad.activity.none")} /> : rows.map((r) => {
        const route = docRoute(r.doctype, r.name);
        const flagged = r.verb !== "submitted" && (r.in_filed_period || r.frozen);
        return (
          <button key={`${r.doctype}-${r.name}`} type="button" className="ad-act" onClick={() => route && nav(route)}>
            <span className="ad-act-when">{whenText(r.when, today)}</span>
            <span className="ad-av" aria-hidden="true">{initials(r.user)}</span>
            <span className="ad-li-t">
              <span><b>{r.user}</b> <span className={`ad-verb ${r.verb}`}>{t(`ad.v.${r.verb}`)}</span> <span className="mono">{r.name}</span></span>
              <span className="od-muted">
                {[r.party, r.amount ? amt(cur, r.amount) : "", r.posting_date ? fill(t("ad.act.dated"), { d: date(r.posting_date) }) : ""].filter(Boolean).join(" · ")}
              </span>
              {flagged && (
                <span className="od-bad">{r.in_filed_period ? t("ad.act.inFiled") : t("ad.act.inFrozen")}</span>
              )}
            </span>
          </button>
        );
      })}
    </section>
  );
}

/* ── Compliance calendar ─────────────────────────────────────────────── */

function CalendarCard({ items, cur }: { items: Payload["calendar"]; cur: string }) {
  const nav = useNavigate();
  return (
    <Card title={t("ad.calendar")} hint={t("ad.calendar.sub")} bodyClass="od-cmp ad-cal">
      {items.length === 0 && <div className="od-cmp-i"><p className="od-note">{t("od.noDeadlines")}</p></div>}
      {items.map((f) => {
        if (f.kind === "vat" || f.kind === "ct") {
          return (
            <button key={f.name} type="button" className="od-cmp-i"
              onClick={() => nav(f.kind === "ct" ? `/ct-filings/${encodeURIComponent(f.name)}` : `/vat-201/${encodeURIComponent(f.name)}`)}>
              <Pill cls={duePill(f.days)}>{daysText(f.days)}</Pill>
              <b>{f.kind === "ct" ? t("od.k.ct") : t("od.k.vat")}</b>
              <span className="od-muted">{f.period_start && f.period_end ? `${date(f.period_start)} – ${date(f.period_end)}` : f.name}</span>
              <span className="num">
                {f.kind === "vat" && f.amount < 0 ? `${t("od.vatRefund")} ${amt(cur, -f.amount)}` : amt(cur, f.amount)}
              </span>
              {f.draft_status && <span className="od-muted">{f.draft_status}</span>}
            </button>
          );
        }
        if (f.kind === "ubo") {
          return (
            <button key={f.name} type="button" className="od-cmp-i" onClick={() => nav(`/ubo/${encodeURIComponent(f.name)}`)}>
              <Pill cls={f.status === "Compliant" ? "p-done" : f.status === "Overdue" ? "p-overdue" : "p-warn"}>{f.status || "—"}</Pill>
              <b>{t("ad.ubo")}</b>
              <span className="od-muted">{f.last_reviewed ? fill(t("ad.ubo.reviewed"), { d: date(f.last_reviewed) }) : t("ad.ubo.never")}</span>
              <span>{fill(t("ad.ubo.owners"), { n: f.owners })}</span>
              <span className="od-muted">{t("ad.ubo.rule")}</span>
            </button>
          );
        }
        if (f.kind !== "readiness") return null;
        return (
          <button key="readiness" type="button" className="od-cmp-i" onClick={() => nav("/tax-settings")}>
            <Pill cls={f.done === f.total ? "p-done" : "p-warn"}>{f.done} / {f.total}</Pill>
            <b>{t("od.readiness")}</b>
            <span className="od-muted">{f.done === f.total ? t("od.readyAll") : fill(t("od.readyMissing"), { n: f.total - f.done })}</span>
            {f.missing.length > 0 && <span className="od-muted">{f.missing.join(" · ")}</span>}
          </button>
        );
      })}
    </Card>
  );
}
