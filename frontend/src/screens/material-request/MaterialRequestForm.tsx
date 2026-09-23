/**
 * Material Request form (new + edit).
 * Importers: App.tsx routes /material-requests/new and /material-requests/:name/edit.
 * API: taxmate.api.resource.insert/save on Material Request; taxmate.api.workflow.submit.
 * Schema: material_request_type, transaction_date, schedule_date, items[{item_code,qty,warehouse,uom}].
 * User: "Implement the plan as specified… complete all the to-dos."
 */
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

const MR_TYPES = ["Purchase", "Material Transfer", "Material Issue", "Manufacture"] as const;
type MRType = (typeof MR_TYPES)[number];

type Line = { item_code: string; qty: number; warehouse: string; from_warehouse?: string; uom?: string; };
type Doc = {
  name: string; material_request_type?: string; transaction_date?: string; schedule_date?: string;
  docstatus?: number; set_warehouse?: string; from_warehouse?: string;
  items?: { item_code?: string; qty?: number; warehouse?: string; from_warehouse?: string; uom?: string; }[];
};

const today = toIsoDate(new Date());
const plus = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return toIsoDate(dt); };
const blank = (): Line => ({ item_code: "", qty: 1, warehouse: "" });

function mrTypeLabel(p: MRType): string {
  if (p === "Purchase") return t("mr.purpose.purchase");
  if (p === "Material Transfer") return t("mr.purpose.transfer");
  if (p === "Material Issue") return t("mr.purpose.issue");
  return t("mr.purpose.manufacture");
}

export default function MaterialRequestForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<Doc>(DT.materialRequest, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall(METHOD.submit);

  const [mrType, setMrType] = useState<MRType>("Purchase");
  const [txDate, setTxDate] = useState(today);
  const [scheduleDate, setScheduleDate] = useState(plus(7));
  const [setWarehouse, setSetWarehouse] = useState("");
  const [fromWarehouse, setFromWarehouse] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setMrType((d.material_request_type as MRType) || "Purchase");
    setTxDate(d.transaction_date || today);
    setScheduleDate(d.schedule_date || plus(7));
    setSetWarehouse(d.set_warehouse || "");
    setFromWarehouse(d.from_warehouse || "");
    const ls = (d.items ?? []).map((it) => ({
      item_code: it.item_code || "",
      qty: Number(it.qty) || 1,
      warehouse: it.warehouse || "",
      from_warehouse: it.from_warehouse || "",
      uom: it.uom,
    }));
    setLines(ls.length ? ls : [blank()]);
  }, [existing.data]);

  const checks = useMemo(() => [
    { label: t("mr.purpose"), ok: !!mrType },
    { label: t("quot.date"), ok: !!txDate },
    { label: t("inv.lines"), ok: lines.length > 0 && lines.every((l) => l.item_code) },
  ], [mrType, txDate, lines]);

  const ready = checks.every((c) => c.ok);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save(shouldSubmit: boolean) {
    setBusy(true); setSaveError(null);
    try {
      const isTransfer = mrType === "Material Transfer";
      const payload = {
        company: session.company,
        material_request_type: mrType,
        transaction_date: txDate,
        schedule_date: scheduleDate,
        set_warehouse: setWarehouse || undefined,
        from_warehouse: isTransfer ? fromWarehouse || undefined : undefined,
        items: lines.map((l) => ({
          item_code: l.item_code,
          qty: l.qty,
          warehouse: l.warehouse || setWarehouse || undefined,
          from_warehouse: isTransfer ? l.from_warehouse || fromWarehouse || undefined : undefined,
          uom: l.uom || undefined,
          schedule_date: scheduleDate,
        })),
      };
      const docname = isNew
        ? (await create.createDoc(DT.materialRequest, payload) as { name: string }).name
        : (await update.updateDoc(DT.materialRequest, name, payload), name);
      if (shouldSubmit) await submitCall.call({ doc: { doctype: DT.materialRequest, name: docname } });
      nav(`/material-requests/${encodeURIComponent(docname)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!isNew && existing.data && existing.data.docstatus !== 0) return <Navigate to={`/material-requests/${encodeURIComponent(name)}`} replace />;

  const whFilters = session.company
    ? [["company", "=", session.company], ["is_group", "=", 0]] as [string, string, string][]
    : undefined;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/material-requests")}>{t("nav.materialRequests")}</button>}
        title={isNew ? t("mr.new") : t("inv.edit")}
        actions={
          <FormActions
            onDiscard={() => nav("/material-requests")}
            onSave={() => void save(false)}
            onSubmit={canSubmit ? () => void save(true) : undefined}
            busy={busy} ready={ready} submitLabel={t("inv.submit")}
          />
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout aside={<ReadinessCard checks={checks} title={t("soc.ready")} caption={t("soc.readyCap")} />}>
        <Card num={1} title={t("mr.purpose")}>
          <div className="grid2">
            <Field label={t("mr.purpose")} required>
              <select className="ctl" value={mrType} onChange={(e) => setMrType(e.target.value as MRType)}>
                {MR_TYPES.map((p) => <option key={p} value={p}>{mrTypeLabel(p)}</option>)}
              </select>
            </Field>
            <Field label={t("quot.date")} required htmlFor="mr-date">
              <input id="mr-date" className="ctl" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </Field>
            <Field label={t("mr.requiredBy")} htmlFor="mr-sched">
              <input id="mr-sched" className="ctl" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </Field>
            <Field label={t("mr.warehouse")}>
              <LinkField doctype={DT.warehouse} filters={whFilters as never}
                value={setWarehouse} onChange={setSetWarehouse} />
            </Field>
            {mrType === "Material Transfer" && (
              <Field label={t("se.warehouse.from")}>
                <LinkField doctype={DT.warehouse} filters={whFilters as never}
                  value={fromWarehouse} onChange={setFromWarehouse} />
              </Field>
            )}
          </div>
        </Card>
        <Card num={2} title={t("mr.items")} bodyClass={null as unknown as string}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th className="n">{t("sod.col.qty")}</th>
                  <th>{t("mr.warehouse")}</th>
                  {mrType === "Material Transfer" && <th>{t("se.warehouse.from")}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                    <td style={{ minWidth: 200 }}>
                      <LinkField doctype={DT.item} value={l.item_code} onChange={(v) => setLine(i, { item_code: v })} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                        onChange={(e) => setLine(i, { qty: parseNum(e.target.value) })} />
                    </td>
                    <td style={{ minWidth: 180 }}>
                      <LinkField doctype={DT.warehouse} filters={whFilters as never}
                        value={l.warehouse} onChange={(v) => setLine(i, { warehouse: v })} />
                    </td>
                    {mrType === "Material Transfer" && (
                      <td style={{ minWidth: 180 }}>
                        <LinkField doctype={DT.warehouse} filters={whFilters as never}
                          value={l.from_warehouse || ""} onChange={(v) => setLine(i, { from_warehouse: v })} />
                      </td>
                    )}
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
            <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, blank()])}>
              {t("mr.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
