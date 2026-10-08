/**
 * All-clients dashboard — the CA / practice view.
 * Design v1.3, claude/ca-my-clients-design.md.
 *
 * Reached at `?as=clients`, from the view switch when the user can open more
 * than one company, and from the header company menu.
 *
 * One server call carries every figure AND every rule:
 *
 *   · each row arrives tagged with the tiles it falls under (`row.tiles`), so
 *     a tile and its filter cannot drift apart — this screen never
 *     re-implements a tile predicate
 *   · rows arrive most-urgent-first, so "sort by most urgent" is simply the
 *     order they were given
 *   · `thresholds` carries every number the copy needs, so no figure here is
 *     written twice
 *
 * What is left is view work: filter the rows we were handed, draw them, and
 * open one. Which is the split we keep to — the server owns the rules.
 *
 * A section the user's role cannot read arrives as null and renders as "—",
 * never as zero. A zero on a dashboard reads as a real figure.
 */

import { useMemo, useState } from "react";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { DataTable, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";
import { DashSwitch } from "./DashSwitch";
import "./dashboard.css";
import "./clients.css";

/* ── Payload ─────────────────────────────────────────────────────────── */

type TileKey = "vat" | "bank" | "einvoice" | "receivables" | "close";
type Status = "bad" | "warn" | "ok";

type Thresholds = {
  vat_due_soon_days: number;
  close_late_days: number;
  bank_lines_piling: number;
  fixes_piling: number;
  receivable_late_days: number;
};

type Row = {
  company: string;
  label: string;
  trn: string | null;
  emirate: string | null;
  kind: string | null;
  currency: string | null;
  country: string | null;
  status: Status | null;
  reason_key: string;
  reason: Record<string, string | number>;
  tiles: TileKey[];
  vat: null | {
    period_start?: string | null; period_end?: string | null; due_date?: string | null;
    days: number | null; state: string | null; filed: boolean; from_log: boolean;
  };
  close: null | { month: string; end: string | null; done: number | null; total: number | null };
  bank: null | {
    unreconciled: number | null; accounts: number; unreadable: number; reconciled_to: string | null;
  };
  fixes: null | { count: number; top_key: string | null; top_count: number | null };
  receivable: null | {
    outstanding: number | null; overdue: number | null; sixty_plus: number | null;
    sixty_plus_invoices: number | null; sixty_plus_oldest_days: number | null;
  };
  einvoice: null | {
    done: number | null; total: number | null; rejected: number | null; pending: number | null;
  };
  ct: null | { due_date: string | null; period_end: string | null; state: string | null };
  staff: null | { user: string; full_name: string };
  error: string | null;
};

type Payload = {
  today: string;
  month: string;
  rows: Row[];
  companies: number;
  truncated: boolean;
  thresholds: Thresholds;
  totals: {
    vat: { clients: number };
    bank: { clients: number; lines: number };
    einvoice: { clients: number };
    receivables: {
      clients: number; overdue: number; sixty_plus: number; sixty_plus_invoices: number;
    };
    close: { clients: number; closed: number; of: number };
    status: Record<Status, number>;
    failed: number;
  };
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/** An unreadable figure is a dash, never a zero. */
const num = (v: number | null | undefined) => (v == null ? "—" : String(v));
const amt = (v: number | null | undefined) => (v == null ? "—" : money(v));

/**
 * `t()` returns the key itself when a string is missing, which would put
 * "cd.fix.supplier_trn" on screen. Anywhere the key is built from a server
 * value rather than written out here, fall back to something readable.
 */
const tOr = (key: string, fallback: string) => {
  const s = t(key);
  return s === key ? fallback : s;
};

const STATUS_PILL: Record<Status, string> = {
  bad: "p-overdue",
  warn: "p-warn",
  ok: "p-done",
};

/**
 * The reason, in words.
 *
 * The server sends a key and its numbers — never a sentence, because the app
 * ships in English and Arabic. Generic on purpose: a new reason_key only needs
 * its string added to i18n/strings.ts, with no change here.
 */
function reasonOf(row: Row): string {
  if (!row.reason_key) return "";
  return fill(t(`cd.reason.${row.reason_key}`), row.reason ?? {});
}

/**
 * Tone for the VAT pill, from the data rather than from the status text.
 *
 * `vat.state` is whatever the UAE VAT 201 Filing Log calls it, which is not a
 * fixed vocabulary this screen should be mapping. `filed` and `days` are, so
 * the colour comes from those and the words come from the server.
 */
function vatTone(row: Row, th: Thresholds): string {
  const v = row.vat;
  if (!v) return "p-flat";
  if (v.filed) return "p-done";
  if (v.days == null) return "p-flat";
  if (v.days < 0) return "p-overdue";
  if (v.days <= th.vat_due_soon_days) return "p-warn";
  return "p-open";
}

function einvoiceTone(row: Row): string {
  const e = row.einvoice;
  if (!e || e.done == null || !e.total) return "p-flat";
  if (e.rejected) return "p-overdue";
  return e.done >= e.total ? "p-done" : "p-warn";
}

/* ── Export ──────────────────────────────────────────────────────────── */

/**
 * The rows as a CSV, built from the PAYLOAD rather than from the rendered
 * cells. A spreadsheet wants `142300`, not the `AED 142,300.00` a cell
 * renders, and not a React node at all.
 *
 * Same Blob-and-anchor shape as the reports export (screens/reports/
 * ReportRunner.tsx), with one addition: a UTF-8 BOM. Without it Excel on
 * Windows reads the file as the local codepage and Arabic client names arrive
 * as mojibake. Worth adding to the reports export too — it is one string.
 */
function csvCell(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return `"${v}"`;
  let s = v == null ? "" : String(v);
  // Excel runs a text cell that starts with one of these. Numbers stay numeric,
  // including a negative "days to VAT due", so a column can still be summed.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv(rows: Row[], th: Thresholds, filename: string): void {
  const head = [
    t("cd.col.client"), t("cd.trn").replace(" {v}", ""), t("f.currency"), t("cd.col.staff"),
    t("cd.col.status"), t("cd.csv.reason"),
    t("cd.csv.vatPeriodEnd"), t("cd.csv.vatDue"), t("cd.csv.vatDays"), t("cd.csv.vatState"),
    t("cd.csv.closeDone"), t("cd.csv.closeTotal"),
    t("cd.col.bank"), t("cd.col.fixes"),
    t("cd.csv.overdue"),
    t("cd.csv.sixtyPlus").replace("{d}", String(th.receivable_late_days)),
    t("cd.csv.sixtyPlusCount").replace("{d}", String(th.receivable_late_days)),
    t("cd.csv.einvDone"), t("cd.csv.einvTotal"),
    t("cd.csv.ctDue"),
  ];
  const lines = [
    head.map(csvCell).join(","),
    ...rows.map((r) => [
      r.label, r.trn, r.currency ?? "", r.staff?.full_name ?? "",
      r.status ? t(`cd.st.${r.status}Short`) : "", reasonOf(r),
      r.vat?.period_end ?? "", r.vat?.due_date ?? "", r.vat?.days ?? "", r.vat?.state ?? "",
      r.close?.done ?? "", r.close?.total ?? "",
      r.bank?.unreconciled ?? "", r.fixes?.count ?? "",
      r.receivable?.overdue ?? "",
      r.receivable?.sixty_plus ?? "",
      r.receivable?.sixty_plus_invoices ?? "",
      r.einvoice?.done ?? "", r.einvoice?.total ?? "",
      r.ct?.due_date ?? "",
    ].map(csvCell).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* ── Screen ──────────────────────────────────────────────────────────── */

export default function ClientsDashboard() {
  const res = useFrappeGetCall<{ message: Payload }>(
    METHOD.clientsDashboard,
    undefined,
    "clients-dashboard",
  );
  const d = res.data?.message;

  const [tile, setTile] = useState<TileKey | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const [q, setQ] = useState("");
  const [staff, setStaff] = useState("");
  const [sort, setSort] = useState("urgency");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const switcher = useFrappePostCall<{ message: { active: string } }>(METHOD.switchCompany);

  /** Staff options come from the data, so nobody is hardcoded. */
  const staffOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of d?.rows ?? []) {
      if (r.staff) seen.set(r.staff.user, r.staff.full_name);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [d?.rows]);

  const rows = useMemo(() => {
    const all = d?.rows ?? [];
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\s/g, "");
    const kept = all.filter((r) => {
      if (tile && !(r.tiles ?? []).includes(tile)) return false;
      if (status && r.status !== status) return false;
      if (staff && r.staff?.user !== staff) return false;
      if (!needle) return true;
      return (
        r.label.toLowerCase().includes(needle)
        || (r.trn ?? "").replace(/\s/g, "").includes(digits)
      );
    });
    /* "Most urgent" is the order the server gave us — it owns that rule.
       The rest are plain field sorts, which are presentation. */
    if (sort === "urgency") return kept;
    const by: Record<string, (a: Row, b: Row) => number> = {
      name: (a, b) => a.label.localeCompare(b.label),
      vat: (a, b) => (a.vat?.days ?? Infinity) - (b.vat?.days ?? Infinity),
      receivables: (a, b) => (b.receivable?.overdue ?? 0) - (a.receivable?.overdue ?? 0),
    };
    return by[sort] ? [...kept].sort(by[sort]) : kept;
  }, [d?.rows, tile, status, staff, q, sort]);

  async function open(row: Row) {
    if (busy || row.error) return;
    setBusy(row.company);
    setFailed(false);
    try {
      await switcher.call({ company: row.company });
      /* A full reload, exactly as the header switcher does: it drops every
         cached list, dashboard and form default from the previous company. */
      window.location.assign("/taxmate/?as=accountant");
    } catch {
      setBusy(null);
      setFailed(true);
    }
  }

  const th = d?.thresholds;
  const columns: Column<Row>[] = useMemo(() => {
    if (!th) return [];
    return buildColumns(th);
  }, [th]);

  return (
    <div className="odash cdash">
      <PageHead
        title={t("cd.title")}
        viewControls={<DashSwitch />}
        actions={
          <button
            type="button"
            className="btn ghost"
            disabled={!d || rows.length === 0}
            onClick={() => d && exportCsv(rows, d.thresholds, `${t("cd.exportFile")}-${d.today}`)}
          >
            {t("cd.export").replace("{n}", String(rows.length))}
          </button>
        }
      />

      {res.error && <ErrorBox error={res.error} onRetry={() => res.mutate()} />}
      {!d && res.isLoading && <Loading />}
      {failed && <ErrorBox error={t("company.switchFailed")} onRetry={() => setFailed(false)} />}

      {d && (
        <>
          {d.truncated && <p className="cd-note">{fill(t("cd.truncated"), { n: d.companies })}</p>}
          {d.totals.failed > 0 && (
            <p className="cd-note cd-note-bad" role="status">
              {fill(t("cd.someFailed"), { n: d.totals.failed })}
            </p>
          )}

          <Tiles totals={d.totals} th={d.thresholds} month={d.month} active={tile}
            onPick={(k) => { setTile(tile === k ? "" : k); setStatus(""); }} />

          <FilterBar>
            <SearchFilter value={q} onChange={setQ} placeholder={t("cd.find")} />
            <SelectFilter<Status>
              value={status}
              onChange={(v) => setStatus(v)}
              allLabel={fill(t("cd.allClients"), { n: d.companies })}
              label={t("cd.statusFilter")}
              options={[
                { value: "bad", label: fill(t("cd.st.bad"), { n: d.totals.status.bad }) },
                { value: "warn", label: fill(t("cd.st.warn"), { n: d.totals.status.warn }) },
                { value: "ok", label: fill(t("cd.st.ok"), { n: d.totals.status.ok }) },
              ]}
            />
            <SelectFilter
              value={staff}
              onChange={(v) => setStaff(v)}
              allLabel={t("cd.everyone")}
              label={t("cd.staffFilter")}
              options={staffOptions}
            />
            <SelectFilter
              value={sort}
              onChange={(v) => setSort(v || "urgency")}
              allLabel={t("cd.sort.urgency")}
              label={t("cd.sortBy")}
              options={[
                { value: "vat", label: t("cd.sort.vat") },
                { value: "receivables", label: t("cd.sort.receivables") },
                { value: "name", label: t("cd.sort.name") },
              ]}
            />
          </FilterBar>

          {tile && (
            <div className="cd-filtered" role="status">
              <Pill cls="p-open">{t("cd.filtered")}</Pill>
              <span>{fill(t("cd.showing"), { n: rows.length, of: d.companies })}</span>
              <button type="button" className="btn ghost sm" onClick={() => setTile("")}>
                {t("cd.clear")}
              </button>
            </div>
          )}

          <div className="card cd-table">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.company}
              onOpen={open}
              canOpen={(r) => !r.error}
              emptyLabel={t("cd.none")}
              rowClassName={(r) =>
                [r.error ? "cd-row-failed" : "", busy === r.company ? "cd-row-busy" : ""]
                  .filter(Boolean).join(" ") || undefined}
            />
          </div>

          <div className="cd-legend">
            <span><Pill cls="p-overdue">{t("cd.st.badShort")}</Pill> {fill(t("cd.legend.bad"), { n: d.thresholds.close_late_days })}</span>
            <span><Pill cls="p-warn">{t("cd.st.warnShort")}</Pill> {fill(t("cd.legend.warn"), { n: d.thresholds.vat_due_soon_days })}</span>
            <span><Pill cls="p-done">{t("cd.st.okShort")}</Pill> {fill(t("cd.legend.ok"), { n: d.thresholds.vat_due_soon_days })}</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Tiles ───────────────────────────────────────────────────────────── */

/**
 * Five clickable tiles that filter the table below.
 *
 * Every number and every threshold in the captions comes from the payload —
 * nothing here is written twice. Each is a real button with `aria-pressed`,
 * because it is a toggle, and the table is its live region.
 */
function Tiles({
  totals, th, month, active, onPick,
}: {
  totals: Payload["totals"];
  th: Thresholds;
  month: string;
  active: TileKey | "";
  onPick: (key: TileKey) => void;
}) {
  const tiles: { key: TileKey; label: string; big: React.ReactNode; sub: string }[] = [
    {
      key: "vat",
      label: fill(t("cd.tile.vat"), { n: th.vat_due_soon_days }),
      big: totals.vat.clients,
      sub: fill(t("cd.tile.clients"), { n: totals.vat.clients }),
    },
    {
      key: "bank",
      label: t("cd.tile.bank"),
      big: totals.bank.lines,
      sub: fill(t("cd.tile.clients"), { n: totals.bank.clients }),
    },
    {
      key: "einvoice",
      label: t("cd.tile.einvoice"),
      big: totals.einvoice.clients,
      sub: fill(t("cd.tile.clients"), { n: totals.einvoice.clients }),
    },
    {
      key: "receivables",
      label: t("cd.tile.receivables"),
      big: money(totals.receivables.overdue),
      sub: fill(t("cd.tile.sixtyPlus"), {
        n: totals.receivables.sixty_plus_invoices,
        d: th.receivable_late_days,
      }),
    },
    {
      key: "close",
      label: fill(t("cd.tile.close"), { m: month }),
      big: `${totals.close.closed} / ${totals.close.of}`,
      sub: fill(t("cd.tile.stillOpen"), { n: totals.close.clients }),
    },
  ];

  return (
    <div className="cd-tiles">
      {tiles.map((x) => (
        <button
          key={x.key}
          type="button"
          className={`cd-tile${active === x.key ? " on" : ""}`}
          aria-pressed={active === x.key}
          onClick={() => onPick(x.key)}
        >
          <span className="cd-tile-lbl">{x.label}</span>
          <span className="cd-tile-big num">{x.big}</span>
          <span className="cd-tile-sub">{x.sub}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Columns ─────────────────────────────────────────────────────────── */

/**
 * The ten columns, with an explicit card `role` on each.
 *
 * Roles are set rather than inferred because inference would read the client
 * name as the title (right) and then guess at the rest; on a ten-column table
 * that guess matters. Below 760px DataTable renders these as cards:
 *
 *   title   the client
 *   status  the status pill and the e-invoicing chip
 *   amount  overdue receivables
 *   meta    VAT return, month close, bank lines
 *   hide    data to fix, corporate tax, staff
 *
 * Those last three are off the phone card — the card has no "More" toggle, and
 * tapping the client opens their full dashboard, which has all of it.
 */
function buildColumns(th: Thresholds): Column<Row>[] {
  return [
    {
      key: "client",
      header: t("cd.col.client"),
      role: "title",
      cell: (r) => (
        <span className="cd-client">
          <b>{r.label}</b>
          {r.trn && <span className="cd-trn mono">{fill(t("cd.trn"), { v: r.trn })}</span>}
          {(r.emirate || r.kind) && (
            <span className="cd-chips">
              {r.emirate && <span className="cd-chip">{r.emirate}</span>}
              {r.kind && <span className="cd-chip">{r.kind}</span>}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "status",
      header: t("cd.col.status"),
      role: "status",
      cell: (r) => {
        if (r.error) return <Pill cls="p-flat">{t("cd.reason.row_failed")}</Pill>;
        if (!r.status) return <span className="cd-dash">—</span>;
        return (
          <span className="cd-stack">
            <Pill cls={STATUS_PILL[r.status]}>{t(`cd.st.${r.status}Short`)}</Pill>
            <span className="cd-why">{reasonOf(r)}</span>
          </span>
        );
      },
    },
    {
      key: "vat",
      header: t("cd.col.vat"),
      role: "meta",
      cell: (r) => {
        const v = r.vat;
        if (!v) return <span className="cd-dash">{t("od.noAccess")}</span>;
        return (
          <span className="cd-stack">
            {v.period_end
              ? <span className="cd-strong">{date(v.period_start ?? null)} – {date(v.period_end)}</span>
              : <span className="cd-dash">{t("cd.vat.noPeriod")}</span>}
            {v.due_date && <span className="cd-sub">{fill(t("cd.vat.due"), { d: date(v.due_date) })}</span>}
            {/* A state that came off a filing log is that document's own word
                for itself, shown as-is the way the rest of the app shows it.
                Only the synthetic "not_started" is ours to translate. */}
            <Pill cls={vatTone(r, th)}>
              {v.from_log ? (v.state ?? t("cd.vat.unknown")) : t("cd.vat.notStarted")}
            </Pill>
          </span>
        );
      },
    },
    {
      key: "close",
      header: t("cd.col.close"),
      role: "meta",
      cell: (r) => {
        const c = r.close;
        if (!c || c.done == null || c.total == null) return <span className="cd-dash">—</span>;
        const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
        return (
          <span className="cd-stack">
            <span className="cd-strong num">{c.done} / {c.total}</span>
            <span className="cd-bar" role="progressbar"
              aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.done}
              aria-label={t("cd.col.close")}>
              <i className={c.done >= c.total ? "ok" : "warn"} style={{ width: `${pct}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      key: "bank",
      header: t("cd.col.bank"),
      className: "n",
      role: "meta",
      cell: (r) => {
        const b = r.bank;
        if (!b) return <span className="cd-dash">{t("od.noAccess")}</span>;
        return (
          <span className="cd-stack cd-end">
            <span className={`cd-count num${b.unreconciled ? "" : " zero"}`}>{num(b.unreconciled)}</span>
            {b.unreadable > 0 && <span className="cd-sub">{fill(t("cd.bank.partial"), { n: b.unreadable })}</span>}
          </span>
        );
      },
    },
    {
      key: "fixes",
      header: t("cd.col.fixes"),
      className: "n",
      role: "hide",
      cell: (r) => {
        const f = r.fixes;
        if (!f) return <span className="cd-dash">{t("od.noAccess")}</span>;
        return (
          <span className="cd-stack cd-end">
            <span className={`cd-count num${f.count ? "" : " zero"}`}>{f.count}</span>
            {f.top_key && (
              <span className="cd-sub">{tOr(`cd.fix.${f.top_key}`, t("cd.fix.other"))}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "receivables",
      header: t("cd.col.receivables"),
      className: "n",
      role: "amount",
      cell: (r) => {
        const v = r.receivable;
        if (!v) return <span className="cd-dash">{t("od.noAccess")}</span>;
        return (
          <span className="cd-stack cd-end">
            <span className="cd-count num">{amt(v.overdue)}</span>
            {v.sixty_plus_invoices
              ? (
                <span className="cd-sub">
                  {fill(t("cd.recv.sixtyPlus"), {
                    n: v.sixty_plus_invoices,
                    d: th.receivable_late_days,
                  })}
                </span>
              )
              : <span className="cd-sub">{t("cd.recv.none")}</span>}
          </span>
        );
      },
    },
    {
      key: "einvoice",
      header: t("cd.col.einvoice"),
      role: "status",
      cell: (r) => {
        const e = r.einvoice;
        if (!e || e.done == null || !e.total) return <span className="cd-dash">—</span>;
        return (
          <span className="cd-stack">
            {/* done / total, both from the server — the denominator follows
                uae.readiness rather than being a number written here. */}
            <Pill cls={einvoiceTone(r)}>{fill(t("cd.einv.ready"), { done: e.done, total: e.total })}</Pill>
            {e.rejected ? <span className="cd-sub">{fill(t("cd.einv.rejected"), { n: e.rejected })}</span> : null}
          </span>
        );
      },
    },
    {
      key: "ct",
      header: t("cd.col.ct"),
      role: "hide",
      cell: (r) => {
        const c = r.ct;
        if (!c?.due_date) return <span className="cd-dash">{t("cd.ct.none")}</span>;
        return (
          <span className="cd-stack">
            <span className="cd-strong">{date(c.due_date)}</span>
            {c.period_end && <span className="cd-sub">{fill(t("cd.ct.fy"), { d: date(c.period_end) })}</span>}
          </span>
        );
      },
    },
    {
      key: "staff",
      header: t("cd.col.staff"),
      role: "hide",
      cell: (r) =>
        r.staff
          ? <span className="cd-staff" title={r.staff.full_name}>{r.staff.full_name}</span>
          : <span className="cd-dash">{t("cd.staff.none")}</span>,
    },
  ];
}
