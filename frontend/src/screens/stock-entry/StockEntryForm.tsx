/**
 * Stock Entry form — new and edit. Purpose: Material Receipt | Material Issue | Material Transfer.
 * Importers: App.tsx routes /stock-entries/new and /stock-entries/:name/edit.
 * API: taxmate.api.resource.insert / save, taxmate.api.workflow.submit.
 * Schema: stock_entry_type, company, posting_date, items[{item_code,qty,s_warehouse,t_warehouse,basic_rate}].
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";
import LineItems, { type LineField } from "../../components/LineItems";

const PURPOSES = ["Material Receipt", "Material Issue", "Material Transfer"] as const;
type Purpose = (typeof PURPOSES)[number];

type Line = {
  item_code: string;
  qty: number;
  basic_rate: number;
  s_warehouse: string;
  t_warehouse: string;
  batch_no?: string;
  serial_no?: string;
  has_batch_no?: number;
  has_serial_no?: number;
};

type CostLine = {
  expense_account: string;
  description: string;
  amount: number;
};

type Doc = {
  name: string;
  stock_entry_type?: string;
  posting_date?: string;
  company?: string;
  docstatus?: number;
  from_warehouse?: string;
  to_warehouse?: string;
  items?: {
    item_code?: string;
    qty?: number;
    basic_rate?: number;
    s_warehouse?: string;
    t_warehouse?: string;
    batch_no?: string;
    serial_no?: string;
    has_batch_no?: number;
    has_serial_no?: number;
  }[];
  additional_costs?: { expense_account?: string; description?: string; amount?: number }[];
};

const today = toIsoDate(new Date());

function blankLine(): Line {
  return { item_code: "", qty: 1, basic_rate: 0, s_warehouse: "", t_warehouse: "", batch_no: "", serial_no: "" };
}

function blankCost(): CostLine {
  return { expense_account: "", description: "", amount: 0 };
}

export default function StockEntryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<Doc>(DT.stockEntry, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall(METHOD.submit);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.stockEntryItemDetails);
  const lineTicket = useRef<number[]>([]);

  const [purpose, setPurpose] = useState<Purpose>("Material Receipt");
  const [postingDate, setPostingDate] = useState(today);
  const [fromWarehouse, setFromWarehouse] = useState("");
  const [toWarehouse, setToWarehouse] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [costs, setCosts] = useState<CostLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setPurpose((d.stock_entry_type as Purpose) || "Material Receipt");
    setPostingDate(d.posting_date || today);
    setFromWarehouse(d.from_warehouse || "");
    setToWarehouse(d.to_warehouse || "");
    const ls = (d.items ?? []).map((it) => ({
      item_code: it.item_code || "",
      qty: Number(it.qty) || 1,
      basic_rate: Number(it.basic_rate) || 0,
      s_warehouse: it.s_warehouse || "",
      t_warehouse: it.t_warehouse || "",
      batch_no: it.batch_no || "",
      serial_no: it.serial_no || "",
      has_batch_no: Number(it.has_batch_no) || (it.batch_no ? 1 : 0),
      has_serial_no: Number(it.has_serial_no) || (it.serial_no ? 1 : 0),
    }));
    setLines(ls.length ? ls : [blankLine()]);
    const cs = (d.additional_costs ?? []).map((c: { expense_account?: string; description?: string; amount?: number }) => ({
      expense_account: c.expense_account || "",
      description: c.description || "",
      amount: Number(c.amount) || 0,
    }));
    setCosts(cs);
  }, [existing.data]);

  const needSrc = purpose === "Material Issue" || purpose === "Material Transfer";
  const needTgt = purpose === "Material Receipt" || purpose === "Material Transfer";

  const checks = useMemo(() => [
    { label: t("se.check.type"), ok: !!purpose },
    { label: t("se.check.date"), ok: !!postingDate },
    { label: t("se.check.lines"), ok: lines.length > 0 && lines.every((l) => l.item_code) },
    {
      label: t("se.check.wh"),
      ok: lines.length > 0 && lines.every((l) =>
        (!needSrc || !!l.s_warehouse) && (!needTgt || !!l.t_warehouse)),
    },
  ], [purpose, postingDate, lines, needSrc, needTgt]);

  const ready = checks.every((c) => c.ok);
  const totalValue = useMemo(() => lines.reduce((s, l) => s + l.qty * l.basic_rate, 0), [lines]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function fillLine(i: number, code: string, warehouse?: string) {
    if (!code || !session.company) {
      setLine(i, { basic_rate: 0, has_batch_no: 0, has_serial_no: 0, batch_no: "", serial_no: "" });
      return;
    }
    const ticket = (lineTicket.current[i] = (lineTicket.current[i] || 0) + 1);
    const qty = lines[i]?.qty || 1;
    try {
      const res = await itemCall.call({
        company: session.company,
        purpose,
        item_code: code,
        qty,
        warehouse: warehouse || undefined,
        posting_date: postingDate,
      });
      if (lineTicket.current[i] !== ticket) return;
      const m = (res?.message ?? {}) as Record<string, unknown>;
      setLines((ls) => ls.map((l, idx) => (
        idx === i && l.item_code === code
          ? {
              ...l,
              basic_rate: Number(m.basic_rate) || 0,
              has_batch_no: m.has_batch_no ? 1 : 0,
              has_serial_no: m.has_serial_no ? 1 : 0,
              batch_no: m.has_batch_no ? l.batch_no : "",
              serial_no: m.has_serial_no ? l.serial_no : "",
            }
          : l
      )));
    } catch (err) {
      if (lineTicket.current[i] !== ticket) return;
      setSaveError(err);
    }
  }

  function payload() {
    // Fill empty per-line warehouses from the header defaults before submitting.
    const filledLines = lines.map((l) => ({
      ...l,
      s_warehouse: needSrc ? (l.s_warehouse || fromWarehouse || undefined) : undefined,
      t_warehouse: needTgt ? (l.t_warehouse || toWarehouse || undefined) : undefined,
    }));
    return {
      company: session.company,
      stock_entry_type: purpose,
      posting_date: postingDate,
      set_posting_time: 1,
      from_warehouse: needSrc ? fromWarehouse || undefined : undefined,
      to_warehouse: needTgt ? toWarehouse || undefined : undefined,
      items: filledLines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        basic_rate: needTgt && !needSrc ? l.basic_rate : undefined,
        s_warehouse: l.s_warehouse,
        t_warehouse: l.t_warehouse,
        batch_no: l.batch_no || undefined,
        serial_no: l.serial_no || undefined,
      })),
      additional_costs: costs.filter((c) => c.expense_account && c.amount).map((c) => ({
        expense_account: c.expense_account,
        description: c.description || undefined,
        amount: c.amount,
      })),
    };
  }

  async function save(shouldSubmit: boolean) {
    setBusy(true); setSaveError(null);
    try {
      const docname = isNew
        ? (await create.createDoc(DT.stockEntry, payload()) as { name: string }).name
        : (await update.updateDoc(DT.stockEntry, name, payload()), name);
      if (shouldSubmit) {
        await submitCall.call({ doc: { doctype: DT.stockEntry, name: docname } });
      }
      nav(`/stock-entries/${encodeURIComponent(docname)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!isNew && existing.data && existing.data.docstatus !== 0) {
    return <Navigate to={`/stock-entries/${encodeURIComponent(name)}`} replace />;
  }

  const whFilters = session.company
    ? [["company", "=", session.company], ["is_group", "=", 0]] as [string, string, string][]
    : undefined;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/stock-entries")}>
            {t("nav.stockEntries")}
          </button>
        }
        title={isNew ? t("se.new") : t("inv.edit")}
        actions={
          <FormActions
            onDiscard={() => nav("/stock-entries")}
            onSave={() => void save(false)}
            onSubmit={canSubmit ? () => void save(true) : undefined}
            busy={busy}
            ready={ready}
            submitLabel={t("inv.submit")}
          />
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout
        aside={
          <>
            <Card bodyClass="cbody">
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("se.summary")}</h2>
              <SumRow k={t("se.total")} v={money(totalValue)} />
            {costs.length > 0 && (
              <SumRow k={t("se.totalCosts")} v={money(costs.reduce((s, c) => s + c.amount, 0))} />
            )}
            </Card>
            <ReadinessCard checks={checks} title={t("soc.ready")} caption={t("se.readyCap")} />
          </>
        }
      >
        <Card num={1} title={t("se.purpose")}>
          <div className="grid2">
            <Field label={t("se.purpose")} required>
              <select className="ctl" value={purpose}
                onChange={(e) => setPurpose(e.target.value as Purpose)}>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p === "Material Receipt" ? t("se.type.receipt")
                      : p === "Material Issue" ? t("se.type.issue")
                      : t("se.type.transfer")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("se.check.date")} required htmlFor="se-date">
              <input id="se-date" className="ctl" type="date" value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)} />
            </Field>
            {needSrc && (
              <Field label={t("se.warehouse.from")}>
                <LinkField doctype={DT.warehouse} filters={whFilters as never}
                  value={fromWarehouse}
                  onChange={(v) => {
                    setFromWarehouse(v);
                    setLines((ls) => ls.map((l) => l.s_warehouse ? l : { ...l, s_warehouse: v }));
                    lines.forEach((l, i) => {
                      if (l.item_code && !l.s_warehouse) void fillLine(i, l.item_code, v);
                    });
                  }}
                />
              </Field>
            )}
            {needTgt && (
              <Field label={t("se.warehouse.to")}>
                <LinkField doctype={DT.warehouse} filters={whFilters as never}
                  value={toWarehouse}
                  onChange={(v) => {
                    setToWarehouse(v);
                    setLines((ls) => ls.map((l) => l.t_warehouse ? l : { ...l, t_warehouse: v }));
                    if (!needSrc) {
                      lines.forEach((l, i) => {
                        if (l.item_code && !l.t_warehouse) void fillLine(i, l.item_code, v);
                      });
                    }
                  }}
                />
              </Field>
            )}
          </div>
        </Card>
        <Card num={2} title={t("se.items")} bodyClass={null as unknown as string}>
          {/* Item and Quantity on the face of a phone card. The warehouses,
              batch and serial sit behind "More": a stock entry usually moves
              everything between the same two warehouses, set once above. */}
          <LineItems<Line>
            rows={lines}
            showIndex
            onRemove={(i) => setLines((ls) => ls.filter((_, j) => j !== i))}
            addLabel={t("se.addLine")}
            onAdd={() => setLines((ls) => [...ls, blankLine()])}
            fields={([
              {
                key: "item", label: t("soc.pickItem"), slot: "title", td: { minWidth: 200 },
                render: (l, i) => (
                  <LinkField doctype={DT.item}
                    filters={[["is_stock_item", "=", 1]] as never}
                    value={l.item_code}
                    onChange={(v) => {
                      const source = l.s_warehouse || fromWarehouse;
                      const target = l.t_warehouse || toWarehouse;
                      const wh = (needSrc && source) || (needTgt && target) || source || target;
                      setLine(i, { item_code: v, batch_no: "", serial_no: "" });
                      void fillLine(i, v, wh || undefined);
                    }} />
                ),
              },
              {
                key: "qty", label: t("sod.col.qty"), slot: "primary", numeric: true,
                render: (l, i) => (
                  <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                    onChange={(e) => setLine(i, { qty: parseNum(e.target.value) })} />
                ),
              },
              ...(needTgt && !needSrc ? [{
                key: "rate", label: t("se.basicRate"), slot: "primary" as const, numeric: true,
                render: (l: Line, i: number) => (
                  <input className="ctl mini nn" style={{ width: 100 }} value={l.basic_rate}
                    onChange={(e) => setLine(i, { basic_rate: parseNum(e.target.value) })} />
                ),
              }] : []),
              ...(needSrc ? [{
                key: "src", label: t("se.warehouse.source"), td: { minWidth: 180 },
                render: (l: Line, i: number) => (
                  <LinkField doctype={DT.warehouse} filters={whFilters as never}
                    value={l.s_warehouse}
                    onChange={(v) => {
                      setLine(i, { s_warehouse: v });
                      if (l.item_code) void fillLine(i, l.item_code, v);
                    }} />
                ),
              }] : []),
              ...(needTgt ? [{
                key: "tgt", label: t("se.warehouse.target"), td: { minWidth: 180 },
                render: (l: Line, i: number) => (
                  <LinkField doctype={DT.warehouse} filters={whFilters as never}
                    value={l.t_warehouse}
                    onChange={(v) => {
                      setLine(i, { t_warehouse: v });
                      if (l.item_code && !needSrc) void fillLine(i, l.item_code, v);
                    }} />
                ),
              }] : []),
              {
                key: "batch", label: t("se.batchNo"), td: { minWidth: 140 },
                render: (l, i) => (
                  l.has_batch_no || l.batch_no ? (
                    <LinkField
                      doctype={DT.batch}
                      value={l.batch_no ?? ""}
                      placeholder={t("se.batchNo")}
                      filters={l.item_code ? [["item", "=", l.item_code]] : undefined}
                      onChange={(v) => setLine(i, { batch_no: v })}
                    />
                  ) : (
                    <span style={{ color: "var(--faint)" }}>—</span>
                  )
                ),
              },
              {
                key: "serial", label: t("se.serialNo"), td: { minWidth: 140 },
                render: (l, i) => (
                  l.has_serial_no || l.serial_no ? (
                    <LinkField
                      doctype={DT.serialNo}
                      value={l.serial_no ?? ""}
                      placeholder={t("se.serialNo")}
                      filters={l.item_code ? [["item_code", "=", l.item_code]] : undefined}
                      onChange={(v) => setLine(i, { serial_no: v })}
                    />
                  ) : (
                    <span style={{ color: "var(--faint)" }}>—</span>
                  )
                ),
              },
            ]) as LineField<Line>[]}
          />
        </Card>
        {(purpose === "Material Receipt") && (
          <Card num={3} title={t("se.costs")} bodyClass={null as unknown as string}>
            {/* Account names the row; the amount is what you type. The free-text
                description is the only thing worth collapsing. */}
            <LineItems<CostLine>
              rows={costs}
              onRemove={(i) => setCosts((cs) => cs.filter((_, j) => j !== i))}
              addLabel={t("se.addCost")}
              onAdd={() => setCosts((cs) => [...cs, blankCost()])}
              fields={[
                {
                  key: "acct", label: t("se.costAccount"), slot: "title", td: { minWidth: 200 },
                  render: (c, i) => (
                    <LinkField
                      doctype={DT.account}
                      value={c.expense_account}
                      onChange={(v) => setCosts((cs) => cs.map((x, j) => j === i ? { ...x, expense_account: v } : x))}
                      filters={[["account_type", "in", "Expense Account,Expenses Included In Valuation"], ["is_group", "=", 0]] as never}
                    />
                  ),
                },
                {
                  key: "desc", label: t("se.costDesc"),
                  render: (c, i) => (
                    <input className="ctl mini" style={{ width: 160 }} value={c.description}
                      onChange={(e) => setCosts((cs) => cs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                  ),
                },
                {
                  key: "amt", label: t("se.costAmt"), slot: "primary", numeric: true,
                  render: (c, i) => (
                    <input className="ctl mini nn" style={{ width: 100 }} value={c.amount}
                      onChange={(e) => setCosts((cs) => cs.map((x, j) => j === i ? { ...x, amount: parseNum(e.target.value) } : x))} />
                  ),
                },
              ] as LineField<CostLine>[]}
            />
          </Card>
        )}
      </FormLayout>
    </>
  );
}
