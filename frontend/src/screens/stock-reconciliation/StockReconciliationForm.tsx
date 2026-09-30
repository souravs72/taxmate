// Importers: App.tsx. API: taxmate.api.resource.insert/save, taxmate.api.workflow.submit.
// Schema: purpose, company, posting_date, items[{item_code,warehouse,qty,valuation_rate}].
// User: "Implement the plan as specified… complete all the to-dos."
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";
import LineItems, { type LineField } from "../../components/LineItems";

const PURPOSES = ["Opening Stock", "Stock Reconciliation"] as const;
type Purpose = (typeof PURPOSES)[number];

type Line = {
  item_code: string;
  item_name?: string;
  warehouse: string;
  qty: number;
  valuation_rate: number;
  batch_no?: string;
  serial_no?: string;
  has_batch_no?: number;
  has_serial_no?: number;
};
type Doc = {
  name: string; purpose?: string; posting_date?: string; docstatus?: number;
  difference_account?: string;
  items?: { item_code?: string; warehouse?: string; qty?: number; valuation_rate?: number; }[];
};

const today = toIsoDate(new Date());
const blank = (): Line => ({
  item_code: "", warehouse: "", qty: 1, valuation_rate: 0, batch_no: "", serial_no: "",
  has_batch_no: 0, has_serial_no: 0,
});

export default function StockReconciliationForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<Doc>(DT.stockReconciliation, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall(METHOD.submit);
  const balanceCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.reconciliationBalance);
  const qtyCall = useFrappePostCall<{ message: { warehouses?: { warehouse?: string }[] } }>(METHOD.itemQty);
  const lineTicket = useRef<number[]>([]);

  const [purpose, setPurpose] = useState<Purpose>("Opening Stock");
  const [postingDate, setPostingDate] = useState(today);
  const [differenceAccount, setDifferenceAccount] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setPurpose((d.purpose as Purpose) || "Opening Stock");
    setPostingDate(d.posting_date || today);
    setDifferenceAccount(d.difference_account || "");
    const ls = (d.items ?? []).map((it) => {
      const row = it as Line;
      return {
        item_code: row.item_code || "",
        item_name: row.item_name || "",
        warehouse: row.warehouse || "",
        qty: Number(row.qty) || 0,
        valuation_rate: Number(row.valuation_rate) || 0,
        batch_no: row.batch_no || "",
        serial_no: row.serial_no || "",
        has_batch_no: row.batch_no ? 1 : 0,
        has_serial_no: row.serial_no ? 1 : 0,
      };
    });
    setLines(ls.length ? ls : [blank()]);
  }, [existing.data]);

  const needsDiffAccount = purpose === "Opening Stock";
  const checks = useMemo(() => [
    { label: t("sr.check.purpose"), ok: !!purpose },
    { label: t("sr.check.date"), ok: !!postingDate },
    { label: t("sr.differenceAccount"), ok: !needsDiffAccount || !!differenceAccount },
    { label: t("sr.check.lines"), ok: lines.length > 0 && lines.every((l) => l.item_code && l.warehouse) },
  ], [purpose, postingDate, differenceAccount, needsDiffAccount, lines]);

  const ready = checks.every((c) => c.ok);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function loadLine(i: number, code: string, warehouse: string, batchNo?: string, date?: string) {
    if (!code || !session.company) return;
    const ticket = (lineTicket.current[i] = (lineTicket.current[i] || 0) + 1);
    const posting = date || postingDate;
    try {
      let wh = warehouse;
      if (!wh) {
        const bins = await qtyCall.call({ item_code: code, company: session.company });
        if (lineTicket.current[i] !== ticket) return;
        const names = (bins?.message?.warehouses ?? [])
          .map((row) => row.warehouse)
          .filter((name): name is string => !!name);
        if (names.length === 1) wh = names[0];
      }
      const balRes = await balanceCall.call({
        item_code: code,
        warehouse: wh || undefined,
        posting_date: posting,
        company: session.company,
        batch_no: batchNo || undefined,
      });
      if (lineTicket.current[i] !== ticket) return;
      const bal = (balRes?.message ?? {}) as Record<string, unknown>;
      const hasBatch = bal.has_batch_no ? 1 : 0;
      const hasSerial = bal.has_serial_no ? 1 : 0;
      const serials = String(bal.serial_nos || "");
      const oneSerial = serials && !/[\n,]/.test(serials) ? serials : "";
      const hasQty = bal.qty != null;
      setLines((ls) => ls.map((l, idx) => {
        if (idx !== i || l.item_code !== code) return l;
        return {
          ...l,
          warehouse: wh || l.warehouse,
          item_name: bal.item_name ? String(bal.item_name) : l.item_name,
          qty: hasQty ? Number(bal.qty) || 0 : l.qty,
          valuation_rate: hasQty ? Number(bal.rate) || 0 : l.valuation_rate,
          has_batch_no: hasBatch,
          has_serial_no: hasSerial,
          batch_no: hasBatch ? (batchNo ?? l.batch_no ?? "") : "",
          serial_no: hasSerial ? (l.serial_no || oneSerial) : "",
        };
      }));
    } catch (err) {
      if (lineTicket.current[i] !== ticket) return;
      setSaveError(err);
    }
  }

  async function save(shouldSubmit: boolean) {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        company: session.company,
        purpose,
        posting_date: postingDate,
        set_posting_time: 1,
        difference_account: differenceAccount || undefined,
        items: lines.map((l) => ({
          item_code: l.item_code,
          warehouse: l.warehouse,
          qty: l.qty,
          valuation_rate: l.valuation_rate,
          batch_no: l.batch_no || undefined,
          serial_no: l.serial_no || undefined,
        })),
      };
      const docname = isNew
        ? (await create.createDoc(DT.stockReconciliation, payload) as { name: string }).name
        : (await update.updateDoc(DT.stockReconciliation, name, payload), name);
      if (shouldSubmit) {
        await submitCall.call({ doc: { doctype: DT.stockReconciliation, name: docname } });
      }
      nav(`/stock-reconciliations/${encodeURIComponent(docname)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!isNew && existing.data && existing.data.docstatus !== 0) {
    return <Navigate to={`/stock-reconciliations/${encodeURIComponent(name)}`} replace />;
  }

  const whFilters = session.company
    ? [["company", "=", session.company], ["is_group", "=", 0]] as [string, string, string][]
    : undefined;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/stock-reconciliations")}>
            {t("nav.stockReconciliations")}
          </button>
        }
        title={isNew ? t("sr.new") : t("inv.edit")}
        actions={
          <FormActions
            onDiscard={() => nav("/stock-reconciliations")}
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
          <ReadinessCard checks={checks} title={t("soc.ready")} caption={t("sr.readyCap")} />
        }
      >
        <Card num={1} title={t("sr.purpose")}>
          <div className="grid2">
            <Field label={t("sr.purpose")} required>
              <select className="ctl" value={purpose}
                onChange={(e) => setPurpose(e.target.value as Purpose)}>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p === "Opening Stock" ? t("sr.purpose.opening") : t("sr.purpose.reconcile")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("sr.check.date")} required htmlFor="sr-date">
              <input id="sr-date" className="ctl" type="date" value={postingDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setPostingDate(next);
                  lines.forEach((l, i) => {
                    if (l.item_code) void loadLine(i, l.item_code, l.warehouse, l.batch_no, next);
                  });
                }} />
            </Field>
            {needsDiffAccount && (
              <Field label={t("sr.differenceAccount")} required>
                <LinkField
                  doctype={DT.account}
                  value={differenceAccount}
                  onChange={setDifferenceAccount}
                  filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] as never : undefined}
                />
              </Field>
            )}
          </div>
        </Card>
        <Card num={2} title={t("sr.items")} bodyClass={null as unknown as string}>
          {/* Item, Quantity and the valuation rate on the face of a phone
              card — the three things a count actually types. Warehouse, batch
              and serial sit behind "More". */}
          <LineItems<Line>
            rows={lines}
            showIndex
            onRemove={(i) => setLines((ls) => ls.filter((_, j) => j !== i))}
            addLabel={t("sr.addLine")}
            onAdd={() => setLines((ls) => [...ls, blank()])}
            fields={[
              {
                key: "item", label: t("soc.pickItem"), slot: "title", td: { minWidth: 200 },
                render: (l, i) => (
                  <>
                    <LinkField doctype={DT.item}
                      filters={[["is_stock_item", "=", 1]] as never}
                      value={l.item_code}
                      onChange={(v) => {
                        setLine(i, { item_code: v, item_name: "", batch_no: "", serial_no: "" });
                        void loadLine(i, v, l.warehouse);
                      }} />
                    {l.item_name && l.item_name !== l.item_code ? (
                      <div className="iname">{l.item_name}</div>
                    ) : null}
                  </>
                ),
              },
              {
                key: "warehouse", label: t("sr.warehouse"), td: { minWidth: 180 },
                render: (l, i) => (
                  <LinkField doctype={DT.warehouse} filters={whFilters as never}
                    value={l.warehouse}
                    onChange={(v) => {
                      setLine(i, { warehouse: v });
                      if (l.item_code) void loadLine(i, l.item_code, v, l.batch_no);
                    }} />
                ),
              },
              {
                key: "qty", label: t("sr.qty"), slot: "primary", numeric: true,
                render: (l, i) => (
                  <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                    onChange={(e) => setLine(i, { qty: parseNum(e.target.value) })} />
                ),
              },
              {
                key: "rate", label: t("sr.rate"), slot: "primary", numeric: true,
                render: (l, i) => (
                  <input className="ctl mini nn" style={{ width: 100 }} value={l.valuation_rate}
                    onChange={(e) => setLine(i, { valuation_rate: parseNum(e.target.value) })} />
                ),
              },
              {
                key: "batch", label: t("sr.batchNo"), td: { minWidth: 140 },
                render: (l, i) => (
                  l.has_batch_no || l.batch_no ? (
                    <LinkField
                      doctype={DT.batch}
                      value={l.batch_no ?? ""}
                      placeholder={t("sr.batchNo")}
                      filters={l.item_code ? [["item", "=", l.item_code]] : undefined}
                      onChange={(v) => {
                        setLine(i, { batch_no: v });
                        if (l.item_code && l.warehouse) void loadLine(i, l.item_code, l.warehouse, v);
                      }}
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
            ] as LineField<Line>[]}
          />
        </Card>
      </FormLayout>
    </>
  );
}
