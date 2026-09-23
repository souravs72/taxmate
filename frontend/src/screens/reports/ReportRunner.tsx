import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import {
  GL_CATEGORIES,
  PERIODICITIES,
  bookFilters,
  chipRange,
  isRunnableReport,
  reportBlurbKey,
  reportCaps,
  type Periodicity,
} from "../../lib/bookReports";
import { useSession } from "../../lib/session";
import { useDoc } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { money, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { LinkFilter, SearchFilter } from "../../components/filters";

type Col = { fieldname?: string; label?: string; fieldtype?: string };
type Row = Record<string, unknown>;
type Chart = { data?: { labels?: string[]; datasets?: { name?: string; values?: number[] }[] } };
type Payload = { result?: Row[]; columns?: Col[]; chart?: Chart };
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

function yearStart(iso?: string): string {
  const d = iso || toIsoDate(new Date());
  return `${d.slice(0, 4)}-01-01`;
}

function isMoney(col: Col): boolean {
  return col.fieldtype === "Currency" || col.fieldtype === "Float" || col.fieldtype === "Int";
}

function cell(row: Row, col: Col): string {
  const v = row[col.fieldname || ""];
  if (v == null || v === "") return "—";
  if (typeof v === "number" || isMoney(col)) return money(Number(v));
  return String(v);
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

function exportCsv(name: string, cols: Col[], rows: Row[]): void {
  const esc = (s: string) => `"${s.replace(/"/g, "\"\"")}"`;
  const lines = [
    cols.map((c) => esc(c.label || c.fieldname || "")).join(","),
    ...rows.map((r) => cols.map((c) => esc(cell(r, c))).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
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
  const { get, set, setMany } = useListParams(20);
  const today = session.today || toIsoDate(new Date());
  const company = session.company;
  const caps = reportCaps(name);
  const allowed = isRunnableReport(name);
  const [find, setFind] = useState("");

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
    : "Monthly";
  const costCenter = get("cc");
  const account = get("account");
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
    paused ? null : `rpt-${name}-${JSON.stringify(filters)}`,
  );

  const columns = useMemo(
    () => usedColumns((run.data?.message?.columns ?? []).filter((c) => c.fieldname), run.data?.message?.result ?? []),
    [run.data],
  );
  const rows = useMemo(
    () => (run.data?.message?.result ?? []).filter((r) => r && typeof r === "object" && !Array.isArray(r)),
    [run.data],
  );
  const q = find.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => columns.some((c) => cell(r, c).toLowerCase().includes(q)));
  }, [rows, columns, q]);

  const blurbKey = reportBlurbKey(name);
  const companyFilters = company ? [["company", "=", company]] : undefined;
  const activeChip = (["month", "quarter", "ytd", "fy"] as const).find((k) => {
    const next = chipRange(k, today, fy.data?.year_start_date, fy.data?.year_end_date);
    return next.from === fromDate && next.to === toDate;
  });
  const hasToggles = caps.accumulated || caps.zeros || caps.groups || caps.ctElections;

  const applyChip = (kind: Chip) => {
    const next = chipRange(kind, today, fy.data?.year_start_date, fy.data?.year_end_date);
    setMany({ from: next.from, to: next.to });
  };

  const openGl = (row: Row) => {
    const acct = String(row.account || "");
    if (!acct || name === "General Ledger") return;
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
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/reports")}>{t("rpt.title")}</button>}
        title={name}
        sub={blurbKey ? t(blurbKey) : t("rpt.runSub")}
        actions={
          <button type="button" className="btn ghost sm" disabled={!shown.length}
            onClick={() => exportCsv(name, columns, shown)}>
            {t("rpt.export")}
          </button>
        }
      />

      <Card bodyClass="rpt-bar">
        {(caps.periodChips || caps.periodicity) && (
          <div className="rpt-top">
            {caps.periodChips && (
              <div className="rpt-links" role="group" aria-label={t("rpt.period")}>
                {(["month", "quarter", "ytd", "fy"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={activeChip === k} onClick={() => applyChip(k)}>
                    {t(`rpt.chip.${k}`)}
                  </button>
                ))}
              </div>
            )}
            {caps.periodicity && (
              <label className="rpt-grain">
                <span>{t("rpt.columns")}</span>
                <select className="ctl" value={periodicity} onChange={(e) => set("p", e.target.value)}>
                  {PERIODICITIES.map((p) => (
                    <option key={p} value={p}>{t(`rpt.p.${p}`)}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="rpt-fields">
          {caps.dates && (
            <>
              <Field label={t("rpt.from")}>
                <input className="ctl" type="date" value={fromDate} onChange={(e) => set("from", e.target.value)} />
              </Field>
              <Field label={t("rpt.to")}>
                <input className="ctl" type="date" value={toDate} onChange={(e) => set("to", e.target.value)} />
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
              <select className="ctl" value={partyType} onChange={(e) => setMany({ ptype: e.target.value, party: "" })}>
                <option value="">{t("rpt.any")}</option>
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
              <input className="ctl" value={voucherNo} onChange={(e) => set("vn", e.target.value)} placeholder={t("rpt.voucher")} />
            </Field>
          )}
          {caps.categorize && (
            <Field label={t("rpt.categorize")}>
              <select className="ctl" value={categorizeBy} onChange={(e) => set("cat", e.target.value)}>
                {GL_CATEGORIES.map((c) => <option key={c} value={c}>{t(CAT_LABEL[c] ?? c)}</option>)}
              </select>
            </Field>
          )}
          {caps.status.length > 0 && (
            <Field label={t("rpt.status")}>
              <select className="ctl" value={status} onChange={(e) => set("status", e.target.value)}>
                <option value="">{t("rpt.any")}</option>
                {caps.status.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
          {caps.sla.length > 0 && (
            <Field label={t("rpt.sla")}>
              <select className="ctl" value={sla} onChange={(e) => set("sla", e.target.value)}>
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
          {!!rows.length && (
            <SearchFilter value={find} onChange={setFind} placeholder={t("rpt.find")} />
          )}
        </div>
      </Card>

      {run.error && <ErrorBox error={run.error} onRetry={() => run.mutate()} />}

      <Card bodyClass="twrap rpt-sheet">
        {paused || run.isLoading ? <Loading />
          : shown.length === 0 ? <Empty label={q ? t("rpt.noneRows") : t("rpt.empty")} />
          : (
            <table>
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={c.fieldname} className={isMoney(c) || i > 0 ? "n" : undefined}>
                      {c.label || c.fieldname}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, i) => {
                  const indent = Number(row.indent) || 0;
                  const clickable = caps.tree && !!row.account && name !== "General Ledger";
                  return (
                    <tr
                      key={i}
                      className={`${row.bold ? "rpt-bold" : ""}${clickable ? " rpt-open" : ""}`}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => openGl(row) : undefined}
                      onKeyDown={clickable ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openGl(row);
                        }
                      } : undefined}
                    >
                      {columns.map((c, ci) => {
                        const raw = row[c.fieldname || ""];
                        const zero = isMoney(c) && (raw === 0 || raw === "0");
                        return (
                          <td
                            key={c.fieldname}
                            className={[
                              isMoney(c) ? "n" : "",
                              row.bold && isMoney(c) ? "tot" : "",
                              zero ? "rpt-zero" : "",
                            ].filter(Boolean).join(" ") || undefined}
                            style={ci === 0 && indent ? { paddingInlineStart: 14 + indent * 16 } : undefined}
                          >
                            {cell(row, c)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </Card>
    </div>
  );
}
