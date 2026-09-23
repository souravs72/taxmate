// Importers: App.tsx. API: taxmate.api.resource.insert/save, taxmate.api.workflow.submit.
// Schema: purpose, company, posting_date, items[{item_code,warehouse,qty,valuation_rate}].
// User: "Implement the plan as specified… complete all the to-dos."
import { useEffect, useMemo, useState } from "react";
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

const PURPOSES = ["Opening Stock", "Stock Reconciliation"] as const;
type Purpose = (typeof PURPOSES)[number];

type Line = { item_code: string; warehouse: string; qty: number; valuation_rate: number; batch_no?: string; };
type Doc = {
  name: string; purpose?: string; posting_date?: string; docstatus?: number;
  difference_account?: string;
  items?: { item_code?: string; warehouse?: string; qty?: number; valuation_rate?: number; }[];
};

const today = toIsoDate(new Date());
const blank = (): Line => ({ item_code: "", warehouse: "", qty: 1, valuation_rate: 0, batch_no: "" });

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
    const ls = (d.items ?? []).map((it) => ({
      item_code: it.item_code || "",
      warehouse: it.warehouse || "",
      qty: Number(it.qty) || 1,
      valuation_rate: Number(it.valuation_rate) || 0,
      batch_no: (it as unknown as { batch_no?: string }).batch_no || "",
    }));
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
                onChange={(e) => setPostingDate(e.target.value)} />
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
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th>{t("sr.warehouse")}</th>
                  <th className="n">{t("sr.qty")}</th>
                  <th className="n">{t("sr.rate")}</th>
                  <th>{t("sr.batchNo")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                    <td style={{ minWidth: 200 }}>
                      <LinkField doctype={DT.item}
                        filters={[["is_stock_item", "=", 1]] as never}
                        value={l.item_code}
                        onChange={(v) => setLine(i, { item_code: v })} />
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <LinkField doctype={DT.warehouse} filters={whFilters as never}
                        value={l.warehouse} onChange={(v) => setLine(i, { warehouse: v })} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                        onChange={(e) => setLine(i, { qty: parseNum(e.target.value) })} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 100 }} value={l.valuation_rate}
                        onChange={(e) => setLine(i, { valuation_rate: parseNum(e.target.value) })} />
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <input className="ctl mini" placeholder="Batch" value={l.batch_no ?? ""}
                        onChange={(e) => setLine(i, { batch_no: e.target.value })} />
                    </td>
                    <td>
                      <button type="button" className="rm" aria-label={t("inv.remove")}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="addrow">
            <button type="button" className="btn ghost sm"
              onClick={() => setLines((ls) => [...ls, blank()])}>
              {t("sr.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
