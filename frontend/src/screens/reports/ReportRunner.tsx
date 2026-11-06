/**
 * Query-report runner — Frappe Desk layout: page head, page-form filters,
 * scrollable datatable, footer. SPA routes only. Callers: App.tsx /reports/:report
 * (Route path="/reports/:report"). User: reports UI like Frappe with horizontal slider.
 *
 * Phone (≤760px): period chips stay visible; dates / links / toggles move into
 * the same bottom sheet pattern list screens use (FilterBar / .lm-sheet).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import {
  GL_CATEGORIES,
  PERIODICITIES,
  bookFilters,
  chipRange,
  isRunnableReport,
  reportCaps,
  type Periodicity,
} from "../../lib/bookReports";
import { useSession } from "../../lib/session";
import { useDoc } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { money, parseDeskMoney, toIsoDate } from "../../lib/format";
import { useLang } from "../../lib/i18n";
import { useIsPhone } from "../../lib/useMedia";
import { t } from "../../i18n/strings";
import { Empty, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { LinkFilter } from "../../components/filters";
import ReportDataTable, { type ReportCol } from "./ReportDataTable";
import "../../styles/list-mobile.css";
import "./reports.css";

type Col = ReportCol;
type Row = Record<string, unknown>;
type SummaryItem = {
  type?: string;
  value?: number | string;
  label?: string;
  datatype?: string;
  currency?: string;
  indicator?: string;
  color?: string;
};
type ChartPayload = {
  type?: string;
  colors?: string[];
  data?: { labels?: string[]; datasets?: { name?: string; values?: Array<number | null> }[] };
};
type Payload = {
  result?: Row[];
  columns?: Col[];
  report_label?: string;
  report_summary?: SummaryItem[];
  chart?: ChartPayload;
  execution_time?: number;
};
type Fy = { year_start_date?: string; year_end_date?: string };
type Chip = "month" | "quarter" | "ytd" | "fy";

const HIDDEN = new Set([
  "indent", "parent_account", "parent_section", "warn", "has_value",
  "account_currency", "currency_symbol",
]);

const CAT_LABEL: Record<string, string> = {
  "Categorize by Voucher (Consolidated)": "rpt.cat.consolidated",
  "Categorize by Voucher": "rpt.cat.voucher",
  "Categorize by Account": "rpt.cat.account",
  "Categorize by Party": "rpt.cat.party",
};

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((out, [k, v]) => out.replaceAll(`{${k}}`, String(v)), s);

const DESK_COPY = {
  en: {
    compare: "For comparison, use >5, <10 or =324. For ranges, use 5:10 (for values between 5 and 10).",
    exec: "Execution time: {s} sec",
    rowNum: "Row",
    colFilter: "Filter {column}",
    toggle: "Show or hide rows under {a}",
  },
  ar: {
    compare: "للمقارنة استخدم >5 أو <10 أو =324. للنطاق استخدم 5:10 (للقيم بين 5 و 10).",
    exec: "مدة التنفيذ: {s} ث",
    rowNum: "الصف",
    colFilter: "تصفية {column}",
    toggle: "إظهار أو إخفاء الصفوف تحت {a}",
  },
} as const;

function yearStart(iso?: string): string {
  const d = iso || toIsoDate(new Date());
  return `${d.slice(0, 4)}-01-01`;
}

function isMoney(col: Col): boolean {
  return col.fieldtype === "Currency" || col.fieldtype === "Float" || col.fieldtype === "Int";
}

type MoneyMark = { mark?: string | null; onRight?: boolean };

function decorate(text: string, mark?: MoneyMark): string {
  const token = (mark?.mark || "").trim();
  if (!token) return text;
  return mark?.onRight === false ? `${token}\u00a0${text}` : `${text}\u00a0${token}`;
}

function amount(n: number, col: Col, mark?: MoneyMark): string {
  const text = col.fieldtype === "Int" ? String(Math.round(n)) : money(n);
  if (col.fieldtype === "Currency") return decorate(text, mark);
  return text;
}

/**
 * Currency cells use the Currency symbol, on the side that doctype stores.
 * UAE VAT 201 (and similar) return `frappe.format` strings; prefer `raw_*`
 * when present, else parse the decorated string.
 */

/** ERPNext wraps total lines in quotes, which break in RTL. */
function unquote(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
  return t;
}

function isClickableAccount(row: Row, reportName: string, hasTree: boolean): boolean {
  if (!hasTree || reportName === "General Ledger") return false;
  const acct = typeof row.account === "string" ? row.account.trim() : "";
  if (!acct) return false;
  // Exclude synthetic calculated / summary total rows in financial statements (e.g. 'Profit for the year', 'Total Expense')
  if (acct.startsWith("'") || acct.endsWith("'") || acct.startsWith('"') || acct.endsWith('"')) return false;
  if (/^(Total\b|Profit\b|Net Profit|Gross Profit)/i.test(acct)) return false;
  return true;
}

/**
 * `account` stays the document id (`Revenue - XSm`) so a row can still
 * open General Ledger. `account_label` is that id's translated heading.
 * `acc_name` is the Account Name column. `account_name` can be
 * `1000 - Revenue`, so it is not used as the visible name.
 */
function accountCell(row: Row, field: string): string | null {
  if (field === "acc_name") {
    return typeof row.acc_name === "string" && row.acc_name.trim() ? unquote(row.acc_name) : null;
  }
  if (field !== "account") return null;
  if (typeof row.account_label === "string" && row.account_label.trim()) return unquote(row.account_label);
  return typeof row.account === "string" && row.account.trim() ? unquote(row.account) : null;
}

function cell(row: Row, col: Col, mark?: MoneyMark): string {
  const field = col.fieldname || "";
  const named = accountCell(row, field);
  if (named != null && named !== "") return named;
  const v = row[field];
  if (v == null || v === "") return "—";
  if (typeof v === "number") return isMoney(col) ? amount(v, col, mark) : String(v);
  if (!isMoney(col)) return String(v);

  const raw = row[`raw_${field}`];
  if (typeof raw === "number" && Number.isFinite(raw)) return amount(raw, col, mark);

  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "-" || trimmed === "—") return "—";
    const parsed = parseDeskMoney(trimmed);
    if (parsed != null) return amount(parsed, col, mark);
    return trimmed;
  }
  return amount(Number(v), col, mark);
}

function spaRouteForVoucher(voucherType: unknown, voucherNo: unknown): string | null {
  const vt = String(voucherType || "");
  const n = String(voucherNo || "");
  if (!n) return null;
  if (vt === "Payment Entry") return `/payments/${encodeURIComponent(n)}`;
  if (vt === "Journal Entry") return `/journals/${encodeURIComponent(n)}`;
  if (vt === "Sales Invoice") return `/invoices/${encodeURIComponent(n)}`;
  if (vt === "Purchase Invoice") return `/purchase-invoices/${encodeURIComponent(n)}`;
  if (vt === "Purchase Receipt") return `/purchase-receipts/${encodeURIComponent(n)}`;
  if (vt === "Delivery Note") return `/delivery-notes/${encodeURIComponent(n)}`;
  return null;
}

function usedColumns(cols: Col[], rows: Row[]): Col[] {
  return cols.filter((c) => {
    if (!c.fieldname || HIDDEN.has(c.fieldname)) return false;
    return rows.some((r) => {
      const v = r[c.fieldname!];
      return v != null && v !== "";
    });
  });
}

function exportCsv(name: string, cols: Col[], rows: Row[], mark?: MoneyMark): void {
  const esc = (s: string) => `"${s.replace(/"/g, "\"\"")}"`;
  const lines = [
    cols.map((c) => esc(c.label || c.fieldname || "")).join(","),
    ...rows.map((r) => cols.map((c) => esc(cell(r, c, mark))).join(",")),
  ];
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function shortAxis(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) {
    const m = a / 1_000_000;
    const text = m >= 10 || Math.abs(m - Math.round(m)) < 0.05 ? String(Math.round(m)) : m.toFixed(1);
    return `${sign}${text}M`;
  }
  if (a >= 1000) return `${sign}${Math.round(a / 1000)}K`;
  return `${sign}${Math.round(a)}`;
}

/** Even steps, with the top tick above the tallest bar. */
function axisTicks(min: number, max: number): number[] {
  const bot = Math.min(0, min);
  const top = Math.max(0, max);
  const span = Math.max(top - bot, Math.abs(top) || 1);
  const rough = span / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  const start = Math.floor(bot / step) * step;
  const end = Math.max(step, Math.ceil((top * 1.08) / step) * step);
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.01; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

/** Income in ink, expense in slate, the result in the one brand blue. */
function seriesColor(name: string, value: number): string {
  const n = name.toLowerCase();
  if (/profit|margin|\bnet\b/.test(n)) return value < 0 ? "var(--bad)" : "var(--brand)";
  if (/expense|loss|debit|outflow/.test(n)) return "var(--muted)";
  if (/income|revenue|credit|inflow|sales/.test(n)) return "var(--text)";
  return "var(--text)";
}

function columnPath(x: number, y: number, w: number, h: number, down: boolean): string {
  const r = Math.max(0, Math.min(4, w / 2, h));
  if (h < 0.5) return "";
  if (!down) {
    return `M${x} ${y + h}H${x + w}V${y + r}Q${x + w} ${y} ${x + w - r} ${y}H${x + r}Q${x} ${y} ${x} ${y + r}Z`;
  }
  return `M${x} ${y}H${x + w}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}Z`;
}

function summaryText(item: SummaryItem, mark?: MoneyMark): string {
  const n = typeof item.value === "number" ? item.value : Number(item.value);
  if (!Number.isFinite(n)) return item.value == null || item.value === "" ? "—" : String(item.value);
  if (item.datatype === "Currency") return decorate(money(n), mark);
  if (item.datatype === "Int") return String(Math.round(n));
  if (item.datatype === "Percent") return `${money(n)}%`;
  if (item.datatype === "Float") return money(n);
  return String(item.value);
}

function toneOf(item: SummaryItem): string {
  const raw = (item.indicator || item.color || "").toLowerCase();
  if (raw === "green" || raw === "red" || raw === "blue") return raw;
  return "";
}

function ReportSummary({ items, mark }: { items: SummaryItem[]; mark?: MoneyMark }) {
  const visible = items.filter((item) => item.type !== "separator" && item.label);
  if (!visible.length) return null;
  return (
    <div className="rpt-summary">
      {visible.map((item) => (
        <div className="rpt-sum" key={item.label}>
          <span>{item.label}</span>
          <b className={toneOf(item)}>{summaryText(item, item.datatype === "Currency" ? mark : undefined)}</b>
        </div>
      ))}
    </div>
  );
}

function ReportChart({ chart }: { chart: ChartPayload }) {
  const labels = chart.data?.labels ?? [];
  const sets = (chart.data?.datasets ?? []).filter((set) => set.name);
  if (!labels.length || !sets.length) return null;
  const single = labels.length === 1;
  const values = sets.flatMap((set) => (set.values ?? []).map((v) => v ?? 0));
  const ticks = axisTicks(Math.min(0, ...values), Math.max(0, ...values));
  const axisMax = ticks[ticks.length - 1] ?? 0;
  const axisMin = ticks[0] ?? 0;
  const span = axisMax - axisMin || 1;
  const W = 1000;
  const H = 168;
  const padL = 52;
  const padR = 12;
  const padT = 22;
  const padB = single ? 28 : 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const yOf = (v: number) => padT + ((axisMax - v) / span) * innerH;
  const zero = yOf(0);
  const columns = single ? sets.length : labels.length;
  const colW = innerW / columns;
  const per = single ? 1 : sets.length;
  const barW = Math.min(single ? 56 : 18, Math.max(4, (colW * (single ? 0.34 : 0.62)) / per));

  type Bar = { name: string; value: number; color: string };
  const groups: { key: string; label: string; bars: Bar[] }[] = single
    ? sets.map((set, si) => {
        const value = set.values?.[0] ?? 0;
        return {
          key: set.name || String(si),
          label: set.name || "",
          bars: [{ name: set.name || "", value, color: seriesColor(set.name || "", value) }],
        };
      })
    : labels.map((label, li) => ({
        key: label,
        label,
        bars: sets.map((set) => {
          const value = set.values?.[li] ?? 0;
          return { name: set.name || "", value, color: seriesColor(set.name || "", value) };
        }),
      }));

  return (
    <figure className="rpt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("rpt.chart")}>
        {ticks.map((tick) => {
          const y = yOf(tick);
          const baseline = Math.abs(tick) < span * 0.001;
          return (
            <g key={tick}>
              {!baseline && (
                <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
              )}
              <text x={padL - 8} y={y + 3} textAnchor="end" fill="var(--faint)" fontSize="11" fontFamily="var(--ui)">
                {shortAxis(tick)}
              </text>
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={zero} y2={zero} stroke="var(--border-2)" strokeWidth="1" />
        {groups.map((group, gi) => {
          const pack = barW * group.bars.length;
          const gx = padL + gi * colW + (colW - pack) / 2;
          return (
            <g key={group.key}>
              {group.bars.map((bar, bi) => {
                const down = bar.value < 0;
                const y = down ? zero : yOf(bar.value);
                const h = Math.max(bar.value === 0 ? 1 : 6, Math.abs(zero - yOf(bar.value)));
                const x = gx + bi * barW + (group.bars.length > 1 ? 1.5 : 0);
                const w = Math.max(2, barW - (group.bars.length > 1 ? 3 : 0));
                const shown = shortAxis(bar.value);
                return (
                  <g key={bar.name}>
                    <path d={columnPath(x, y, w, h, down)} fill={bar.color}>
                      <title>{`${bar.name}: ${shown}`}</title>
                    </path>
                    {single && (
                      <text
                        x={x + w / 2}
                        y={down ? y + h + 14 : Math.max(12, y - 14)}
                        textAnchor="middle"
                        fill={bar.color}
                        fontSize="12"
                        fontWeight="600"
                        fontFamily="var(--ui)"
                      >
                        {shown}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={padL + gi * colW + colW / 2}
                y={H - 8}
                textAnchor="middle"
                fill="var(--muted)"
                fontSize="11"
                fontFamily="var(--ui)"
              >
                {group.label}
              </text>
            </g>
          );
        })}
      </svg>
      {!single && (
        <ul className="rpt-chart-legend">
          {sets.map((set) => (
            <li key={set.name}>
              <span className="rpt-swatch" style={{ background: seriesColor(set.name || "", 1) }} />
              {set.name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

function Check({ on, label, onChange }: { on: boolean; label: string; onChange: () => void }) {
  return (
    <label className="rpt-check">
      <input type="checkbox" checked={on} onChange={onChange} />
      {label}
    </label>
  );
}

export default function ReportRunner() {
  const { report = "" } = useParams();
  const name = decodeURIComponent(report);
  const nav = useNavigate();
  const session = useSession();
  const { lang } = useLang();
  const phone = useIsPhone();
  const { get, set, setMany } = useListParams(20);
  const today = session.today || toIsoDate(new Date());
  const company = session.company;
  const currencyDoc = useDoc<{ symbol?: string; symbol_on_right?: 0 | 1 }>(
    "Currency",
    session.currency || undefined,
    session.currency ? `currency-${session.currency}` : null,
  );
  const moneyMark: MoneyMark = {
    mark: currencyDoc.data?.symbol || session.currency,
    onRight: currencyDoc.data?.symbol_on_right !== 0,
  };
  const caps = reportCaps(name);
  const allowed = isRunnableReport(name);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);

  const defaults = useFrappeGetCall<{ message: { fiscal_year?: string } }>(
    METHOD.getDefaults,
    { company },
    company ? `defaults-${company}` : null,
  );
  const fiscalYear = defaults.data?.message?.fiscal_year;
  const fy = useDoc<Fy>("Fiscal Year", fiscalYear, fiscalYear ? `fy-${fiscalYear}` : null);

  const fromDate = get("from") || fy.data?.year_start_date || yearStart(today);
  const toDate = get("to") || today;
  const periodicity = (PERIODICITIES as readonly string[]).includes(get("p"))
    ? (get("p") as Periodicity)
    : "Yearly";
  const costCenter = get("cc");
  const rawAccount = get("account");
  const account = rawAccount && (rawAccount.startsWith("'") || rawAccount.endsWith("'") || rawAccount.startsWith('"') || rawAccount.endsWith('"')) ? "" : rawAccount;
  const warehouse = get("wh");
  const itemCode = get("item");
  const partyType = get("ptype") || (caps.party === "typed" ? "" : caps.party || "");
  const party = get("party");
  const voucherNo = get("vn");
  const categorizeBy = get("cat") || "Categorize by Voucher (Consolidated)";
  const showZeros = get("zeros") === "1";
  const accumulated = get("acc") === "0" ? false : get("acc") === "1" ? true : undefined;
  const showGroups = get("groups") !== "0";
  const status = get("status");
  const sla = get("sla");
  const electSbr = get("sbr") === "1";
  const electQfzp = get("qfzp") === "1";

  const needsFy = name === "Trial Balance" || name === "Profit and Loss Statement"
    || name === "Balance Sheet" || name === "Cash Flow";
  const paused = !session.user || !company || !allowed || (needsFy && !fiscalYear);

  const filters = useMemo(() => {
    if (!company) return {};
    return bookFilters(name, {
      company, fiscalYear, fromDate, toDate, periodicity, costCenter, account,
      partyType, party, voucherNo, categorizeBy, showZeros, accumulated, showGroups,
      status, sla, electSbr, electQfzp, warehouse, itemCode,
    });
  }, [
    name, company, fiscalYear, fromDate, toDate, periodicity, costCenter, account,
    partyType, party, voucherNo, categorizeBy, showZeros, accumulated, showGroups,
    status, sla, electSbr, electQfzp, warehouse, itemCode,
  ]);

  const run = useFrappeGetCall<{ message: Payload }>(
    METHOD.runReport,
    { report_name: name, filters },
    paused ? null : `rpt-${lang}-${name}-${JSON.stringify(filters)}`,
  );

  const columns = useMemo(
    () => usedColumns((run.data?.message?.columns ?? []).filter((c) => c.fieldname), run.data?.message?.result ?? []),
    [run.data],
  );
  const rows = useMemo(
    () => (run.data?.message?.result ?? []).filter((r) => r && typeof r === "object" && !Array.isArray(r)),
    [run.data],
  );
  const summary = run.data?.message?.report_summary ?? [];
  const chart = run.data?.message?.chart;
  const execution = run.data?.message?.execution_time;
  const companyFilters = company ? [["company", "=", company]] : undefined;
  const activeChip = (["month", "quarter", "ytd", "fy"] as const).find((k) => {
    const next = chipRange(k, today, fy.data?.year_start_date, fy.data?.year_end_date);
    return next.from === fromDate && next.to === toDate;
  });
  const hasToggles = caps.accumulated || caps.zeros || caps.groups || caps.ctElections;

  /** Sheet badge: URL-set extras (not period chips / grain). */
  const sheetApplied = useMemo(() => {
    let n = 0;
    if (caps.dates && (get("from") || get("to"))) n += 1;
    if (caps.costCenter && costCenter) n += 1;
    if (caps.account && account) n += 1;
    if (caps.warehouse && warehouse) n += 1;
    if (caps.itemCode && itemCode) n += 1;
    if (caps.party === "typed" && partyType) n += 1;
    if (caps.party && party) n += 1;
    if (caps.voucher && voucherNo) n += 1;
    if (caps.categorize && categorizeBy !== "Categorize by Voucher (Consolidated)") n += 1;
    if (caps.status.length > 0 && status) n += 1;
    if (caps.sla.length > 0 && sla) n += 1;
    if (caps.zeros && showZeros) n += 1;
    if (caps.accumulated && get("acc")) n += 1;
    if (caps.groups && get("groups") === "0") n += 1;
    if (caps.ctElections && (electSbr || electQfzp)) n += 1;
    return n;
  }, [
    caps, get, costCenter, account, warehouse, itemCode, partyType, party,
    voucherNo, categorizeBy, status, sla, showZeros, electSbr, electQfzp,
  ]);

  const sheetFieldCount = useMemo(() => {
    let n = 0;
    if (caps.dates) n += 2;
    if (caps.costCenter) n += 1;
    if (caps.account) n += 1;
    if (caps.warehouse) n += 1;
    if (caps.itemCode) n += 1;
    if (caps.party === "typed") n += 1;
    if (caps.party) n += 1;
    if (caps.voucher) n += 1;
    if (caps.categorize) n += 1;
    if (caps.status.length > 0) n += 1;
    if (caps.sla.length > 0) n += 1;
    if (hasToggles) n += 1;
    return n;
  }, [caps, hasToggles]);

  const clearSheetFilters = () => {
    setMany({
      from: "", to: "", cc: "", account: "", wh: "", item: "",
      ptype: "", party: "", vn: "", cat: "", zeros: "", acc: "", groups: "",
      status: "", sla: "", sbr: "", qfzp: "",
    });
  };

  useEffect(() => {
    if (!phone) setSheetOpen(false);
  }, [phone]);

  useEffect(() => {
    if (!sheetOpen) return;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setSheetOpen(false);
        filterBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const applyChip = (kind: Chip) => {
    const next = chipRange(kind, today, fy.data?.year_start_date, fy.data?.year_end_date);
    setMany({ from: next.from, to: next.to });
  };

  const closeSheet = () => {
    setSheetOpen(false);
    filterBtnRef.current?.focus();
  };

  const activateRow = (row: Row) => {
    const voucherRoute = spaRouteForVoucher(row.voucher_type, row.voucher_no);
    if (voucherRoute) {
      nav(voucherRoute);
      return;
    }
    if (!isClickableAccount(row, name, !!caps.tree)) return;
    const acct = unquote(String(row.account || ""));
    const params = new URLSearchParams({ account: acct, from: fromDate, to: toDate });
    nav(`/reports/${encodeURIComponent("General Ledger")}?${params}`);
  };

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
    <div className="rpt-run">
      <header className="rpt-head">
        <nav aria-label={t("rpt.title")}>
          <ol className="rpt-crumbs">
            <li><button type="button" onClick={() => nav("/reports")}>{t("rpt.title")}</button></li>
            <li><h1>{run.data?.message?.report_label || name}</h1></li>
          </ol>
        </nav>
        <div className="rpt-head-acts">
          <button type="button" className="rpt-icon" disabled={paused || run.isLoading} onClick={() => run.mutate()} aria-label={t("rpt.refresh")}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M13.2 8a5.2 5.2 0 1 1-1.4-3.5" strokeLinecap="round" />
              <path d="M13.2 2.8v3.2H10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="rpt-icon" disabled={!rows.length} onClick={() => exportCsv(name, columns, rows, moneyMark)} aria-label={t("rpt.export")}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M8 2.5v7M5.5 7.2 8 9.7l2.5-2.5M3.2 12.5h9.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* Frappe `.page-form` — filters above the grid (sheet on phone). */}
      <div className={`rpt-form${phone ? " rpt-form-phone" : ""}`}>
        {phone && (caps.periodChips || caps.periodicity || sheetFieldCount > 0) && (
          <div className="rpt-top">
            {caps.periodChips && (
              <select
                className="ctl"
                aria-label={t("rpt.period")}
                value={activeChip || ""}
                onChange={(e) => { if (e.target.value) applyChip(e.target.value as Chip); }}
              >
                <option value="">{t("rpt.period")}</option>
                {(["month", "quarter", "ytd", "fy"] as const).map((k) => (
                  <option key={k} value={k}>{t(`rpt.chip.${k}`)}</option>
                ))}
              </select>
            )}
            {caps.periodicity && (
              <select className="ctl" aria-label={t("rpt.periodicity")} value={periodicity} onChange={(e) => set("p", e.target.value)}>
                {PERIODICITIES.map((p) => (
                  <option key={p} value={p}>{t(`rpt.p.${p}`)}</option>
                ))}
              </select>
            )}
            {sheetFieldCount > 0 && (
              <button
                ref={filterBtnRef}
                type="button"
                className={`lm-fbtn rpt-fbtn${sheetApplied > 0 ? " lm-on" : ""}`}
                aria-expanded={sheetOpen}
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(true)}
              >
                <svg className="lm-ic" width="15" height="15" viewBox="0 0 16 16" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                  <path d="M2 4h12M4.5 8h7M7 12h2" />
                </svg>
                {t("m.filters")}
                {sheetApplied > 0 && <span className="lm-fcount">{sheetApplied}</span>}
              </button>
            )}
          </div>
        )}

        {(!phone || !sheetFieldCount) && (
          <div className="rpt-fields">
            {!phone && caps.periodChips && (
              <select
                className="ctl"
                aria-label={t("rpt.period")}
                value={activeChip || ""}
                onChange={(e) => { if (e.target.value) applyChip(e.target.value as Chip); }}
              >
                <option value="">{t("rpt.period")}</option>
                {(["month", "quarter", "ytd", "fy"] as const).map((k) => (
                  <option key={k} value={k}>{t(`rpt.chip.${k}`)}</option>
                ))}
              </select>
            )}
            {!phone && caps.periodicity && (
              <select className="ctl" aria-label={t("rpt.periodicity")} value={periodicity} onChange={(e) => set("p", e.target.value)}>
                {PERIODICITIES.map((p) => (
                  <option key={p} value={p}>{t(`rpt.p.${p}`)}</option>
                ))}
              </select>
            )}
            {caps.dates && (
              <>
                <Field label={t("rpt.from")}>
                  <input className="ctl" type="date" aria-label={t("rpt.from")} value={fromDate} onChange={(e) => set("from", e.target.value)} />
                </Field>
                <Field label={t("rpt.to")}>
                  <input className="ctl" type="date" aria-label={t("rpt.to")} value={toDate} onChange={(e) => set("to", e.target.value)} />
                </Field>
              </>
            )}
            {caps.costCenter && (
              <Field label={t("rpt.costCenter")}>
                <LinkFilter
                  doctype={DT.costCenter}
                  value={costCenter}
                  placeholder={t("rpt.costCenter")}
                  filters={companyFilters}
                  onChange={(v) => set("cc", v)}
                />
              </Field>
            )}
            {caps.account && (
              <Field label={t("rpt.account")}>
                <LinkFilter
                  doctype={DT.account}
                  value={account}
                  placeholder={t("rpt.account")}
                  filters={companyFilters}
                  onChange={(v) => set("account", v)}
                />
              </Field>
            )}
            {caps.warehouse && (
              <Field label={t("rpt.warehouse")}>
                <LinkFilter
                  doctype={DT.warehouse}
                  value={warehouse}
                  placeholder={t("rpt.warehouse")}
                  filters={companyFilters}
                  onChange={(v) => set("wh", v)}
                />
              </Field>
            )}
            {caps.itemCode && (
              <Field label={t("rpt.item")}>
                <LinkFilter
                  doctype={DT.item}
                  value={itemCode}
                  placeholder={t("rpt.item")}
                  onChange={(v) => set("item", v)}
                />
              </Field>
            )}
            {caps.party === "typed" && (
              <Field label={t("rpt.partyType")}>
                <select className="ctl" aria-label={t("rpt.partyType")} value={partyType} onChange={(e) => setMany({ ptype: e.target.value, party: "" })}>
                  <option value="">{t("rpt.partyType")}</option>
                  <option value="Customer">{t("nav.customers")}</option>
                  <option value="Supplier">{t("nav.suppliers")}</option>
                </select>
              </Field>
            )}
            {caps.party && (caps.party !== "typed" || partyType) && (
              <Field label={t("rpt.party")}>
                <LinkFilter
                  doctype={caps.party === "typed" ? partyType : caps.party}
                  value={party}
                  placeholder={t("rpt.party")}
                  onChange={(v) => set("party", v)}
                />
              </Field>
            )}
            {caps.voucher && (
              <Field label={t("rpt.voucher")}>
                <input className="ctl" aria-label={t("rpt.voucher")} value={voucherNo} onChange={(e) => set("vn", e.target.value)} placeholder={t("rpt.voucher")} />
              </Field>
            )}
            {caps.categorize && (
              <Field label={t("rpt.categorize")}>
                <select className="ctl" aria-label={t("rpt.categorize")} value={categorizeBy} onChange={(e) => set("cat", e.target.value)}>
                  {GL_CATEGORIES.map((c) => <option key={c} value={c}>{t(CAT_LABEL[c] ?? c)}</option>)}
                </select>
              </Field>
            )}
            {caps.status.length > 0 && (
              <Field label={t("rpt.status")}>
                <select className="ctl" aria-label={t("rpt.status")} value={status} onChange={(e) => set("status", e.target.value)}>
                  <option value="">{t("rpt.any")}</option>
                  {caps.status.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            {caps.sla.length > 0 && (
              <Field label={t("rpt.sla")}>
                <select className="ctl" aria-label={t("rpt.sla")} value={sla} onChange={(e) => set("sla", e.target.value)}>
                  <option value="">{t("rpt.any")}</option>
                  {caps.sla.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            {hasToggles && (
              <div className="rpt-checks">
                {caps.accumulated && (
                  <Check
                    on={(accumulated ?? name === "Balance Sheet") === true}
                    label={t("rpt.accumulated")}
                    onChange={() => set("acc", (accumulated ?? name === "Balance Sheet") ? "0" : "1")}
                  />
                )}
                {caps.zeros && (
                  <Check on={showZeros} label={t("rpt.zeros")} onChange={() => set("zeros", showZeros ? "" : "1")} />
                )}
                {caps.groups && (
                  <Check on={showGroups} label={t("rpt.groups")} onChange={() => set("groups", showGroups ? "0" : "1")} />
                )}
                {caps.ctElections && (
                  <>
                    <Check on={electSbr} label={t("rpt.sbr")} onChange={() => set("sbr", electSbr ? "" : "1")} />
                    <Check on={electQfzp} label={t("rpt.qfzp")} onChange={() => set("qfzp", electQfzp ? "" : "1")} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {phone && sheetOpen && sheetFieldCount > 0 && (
        <>
          <button type="button" className="lm-scrim" tabIndex={-1} aria-label={t("m.close")} onClick={closeSheet} />
          <div
            className="lm-sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("m.filters")}
            tabIndex={-1}
          >
            <div className="lm-shead">
              <b>{t("m.filters")}</b>
              {sheetApplied > 0 && (
                <span className="lm-sapplied">{t("m.filters.on").replace("{n}", String(sheetApplied))}</span>
              )}
              <button type="button" className="lm-x" aria-label={t("m.close")} onClick={closeSheet}>✕</button>
            </div>
            <div className="lm-sbody rpt-sheet-body">
              {caps.dates && (
                <>
                  <div className="lm-frow">
                    <Field label={t("rpt.from")}>
                      <input className="ctl" type="date" value={fromDate} onChange={(e) => set("from", e.target.value)} />
                    </Field>
                  </div>
                  <div className="lm-frow">
                    <Field label={t("rpt.to")}>
                      <input className="ctl" type="date" value={toDate} onChange={(e) => set("to", e.target.value)} />
                    </Field>
                  </div>
                </>
              )}
              {caps.costCenter && (
                <div className="lm-frow">
                  <Field label={t("rpt.costCenter")}>
                    <LinkFilter
                      doctype={DT.costCenter}
                      value={costCenter}
                      placeholder={t("rpt.costCenter")}
                      filters={companyFilters}
                      onChange={(v) => set("cc", v)}
                    />
                  </Field>
                </div>
              )}
              {caps.account && (
                <div className="lm-frow">
                  <Field label={t("rpt.account")}>
                    <LinkFilter
                      doctype={DT.account}
                      value={account}
                      placeholder={t("rpt.account")}
                      filters={companyFilters}
                      onChange={(v) => set("account", v)}
                    />
                  </Field>
                </div>
              )}
              {caps.warehouse && (
                <div className="lm-frow">
                  <Field label={t("rpt.warehouse")}>
                    <LinkFilter
                      doctype={DT.warehouse}
                      value={warehouse}
                      placeholder={t("rpt.warehouse")}
                      filters={companyFilters}
                      onChange={(v) => set("wh", v)}
                    />
                  </Field>
                </div>
              )}
              {caps.itemCode && (
                <div className="lm-frow">
                  <Field label={t("rpt.item")}>
                    <LinkFilter
                      doctype={DT.item}
                      value={itemCode}
                      placeholder={t("rpt.item")}
                      onChange={(v) => set("item", v)}
                    />
                  </Field>
                </div>
              )}
              {caps.party === "typed" && (
                <div className="lm-frow">
                  <Field label={t("rpt.partyType")}>
                    <select className="ctl" aria-label={t("rpt.partyType")} value={partyType} onChange={(e) => setMany({ ptype: e.target.value, party: "" })}>
                      <option value="">{t("rpt.any")}</option>
                      <option value="Customer">{t("nav.customers")}</option>
                      <option value="Supplier">{t("nav.suppliers")}</option>
                    </select>
                  </Field>
                </div>
              )}
              {caps.party && (caps.party !== "typed" || partyType) && (
                <div className="lm-frow">
                  <Field label={t("rpt.party")}>
                    <LinkFilter
                      doctype={caps.party === "typed" ? partyType : caps.party}
                      value={party}
                      placeholder={t("rpt.party")}
                      onChange={(v) => set("party", v)}
                    />
                  </Field>
                </div>
              )}
              {caps.voucher && (
                <div className="lm-frow">
                  <Field label={t("rpt.voucher")}>
                    <input className="ctl" aria-label={t("rpt.voucher")} value={voucherNo} onChange={(e) => set("vn", e.target.value)} placeholder={t("rpt.voucher")} />
                  </Field>
                </div>
              )}
              {caps.categorize && (
                <div className="lm-frow">
                  <Field label={t("rpt.categorize")}>
                    <select className="ctl" aria-label={t("rpt.categorize")} value={categorizeBy} onChange={(e) => set("cat", e.target.value)}>
                      {GL_CATEGORIES.map((c) => <option key={c} value={c}>{t(CAT_LABEL[c] ?? c)}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              {caps.status.length > 0 && (
                <div className="lm-frow">
                  <Field label={t("rpt.status")}>
                    <select className="ctl" aria-label={t("rpt.status")} value={status} onChange={(e) => set("status", e.target.value)}>
                      <option value="">{t("rpt.any")}</option>
                      {caps.status.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              {caps.sla.length > 0 && (
                <div className="lm-frow">
                  <Field label={t("rpt.sla")}>
                    <select className="ctl" aria-label={t("rpt.sla")} value={sla} onChange={(e) => set("sla", e.target.value)}>
                      <option value="">{t("rpt.any")}</option>
                      {caps.sla.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              {hasToggles && (
                <div className="lm-frow rpt-checks">
                  {caps.accumulated && (
                    <Check
                      on={(accumulated ?? name === "Balance Sheet") === true}
                      label={t("rpt.accumulated")}
                      onChange={() => set("acc", (accumulated ?? name === "Balance Sheet") ? "0" : "1")}
                    />
                  )}
                  {caps.zeros && (
                    <Check on={showZeros} label={t("rpt.zeros")} onChange={() => set("zeros", showZeros ? "" : "1")} />
                  )}
                  {caps.groups && (
                    <Check on={showGroups} label={t("rpt.groups")} onChange={() => set("groups", showGroups ? "0" : "1")} />
                  )}
                  {caps.ctElections && (
                    <>
                      <Check on={electSbr} label={t("rpt.sbr")} onChange={() => set("sbr", electSbr ? "" : "1")} />
                      <Check on={electQfzp} label={t("rpt.qfzp")} onChange={() => set("qfzp", electQfzp ? "" : "1")} />
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="lm-sfoot">
              <button type="button" className="btn ghost" onClick={clearSheetFilters}>{t("m.filters.clear")}</button>
              <button type="button" className="btn" onClick={closeSheet}>{t("m.filters.show")}</button>
            </div>
          </div>
        </>
      )}

      {run.error && <ErrorBox error={run.error} onRetry={() => run.mutate()} />}

      {!paused && !run.isLoading && summary.length > 0 && (
        <ReportSummary items={summary} mark={moneyMark} />
      )}
      {!paused && !run.isLoading && chart?.data?.labels?.length ? <ReportChart chart={chart} /> : null}

      <div className="rpt-grid-wrap">
        <ReportDataTable
          columns={columns}
          rows={rows}
          isMoney={isMoney}
          compact={phone}
          loading={paused || run.isLoading}
          loadingNode={<Loading />}
          empty={<Empty label={t("rpt.empty")} />}
          footnote={DESK_COPY[lang].compare}
          countLabel={(shownN, totalN) => {
            const exec = typeof execution === "number" ? fill(DESK_COPY[lang].exec, { s: execution.toFixed(6) }) : "";
            const rowsText = shownN === totalN
              ? fill(t("rpt.rowCount"), { n: shownN })
              : fill(t("rpt.ofTotal"), { n: shownN, total: totalN });
            if (exec && shownN !== totalN) return `${rowsText} · ${exec}`;
            return exec || rowsText;
          }}
          filterLabel={(column) => fill(DESK_COPY[lang].colFilter, { column })}
          rowNumberLabel={DESK_COPY[lang].rowNum}
          toggleLabel={(accountName) => fill(DESK_COPY[lang].toggle, { a: accountName })}
          noMatch={<Empty label={t("rpt.noneRows")} />}
          regionLabel={t("rpt.resultsRegion")}
          isRowActive={(row) => {
            if (spaRouteForVoucher(row.voucher_type, row.voucher_no)) return true;
            return isClickableAccount(row, name, !!caps.tree);
          }}
          rowLabel={(row) => {
            const voucherRoute = spaRouteForVoucher(row.voucher_type, row.voucher_no);
            if (voucherRoute) {
              return fill(t("rpt.openVoucher"), {
                t: String(row.voucher_type || ""),
                n: String(row.voucher_no || ""),
              });
            }
            if (isClickableAccount(row, name, !!caps.tree)) {
              return fill(t("rpt.openAccount"), { a: unquote(String(row.account || "")) });
            }
            return "";
          }}
          rowClassName={(row) => {
            const clickable = isClickableAccount(row, name, !!caps.tree);
            const voucherRoute = spaRouteForVoucher(row.voucher_type, row.voucher_no);
            const acct = String(row.account || "");
            const quoted = (acct.startsWith("'") && acct.endsWith("'")) || (acct.startsWith('"') && acct.endsWith('"'));
            return [
              row.bold || quoted ? "rpt-bold" : "",
              clickable || voucherRoute ? "rpt-open" : "",
            ].filter(Boolean).join(" ");
          }}
          onRowActivate={activateRow}
          renderCell={(row, c) => cell(row, c, moneyMark)}
        />
      </div>
    </div>
  );
}
