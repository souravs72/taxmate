/**
 * Material Request detail.
 * Importers: App.tsx route /material-requests/:name.
 * API: taxmate.api.resource.get on Material Request; taxmate.api.material_request.make_purchase_order / make_stock_entry.
 * Schema: name, material_request_type, transaction_date, schedule_date, status, docstatus, items[{item_code,qty,warehouse}].
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales } from "../../lib/roles";
import { date, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Line = { item_code?: string; item_name?: string; qty?: number; uom?: string; warehouse?: string; };
type Doc = {
  name: string; material_request_type?: string; transaction_date?: string; schedule_date?: string;
  status?: string; docstatus?: number; items?: Line[];
};

function mrPill(status?: string): string {
  if (status === "Cancelled" || status === "Stopped") return "p-cxl";
  if (status === "Ordered" || status === "Transferred" || status === "Issued") return "p-done";
  if (status === "Pending") return "p-open";
  return "p-draft";
}

export default function MaterialRequestDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.materialRequest, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const makePO = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeMrPO);
  const makeSE = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeMrSE);
  const create = useInsert();
  const [busy, setBusy] = useState<"" | "po" | "se">("");
  const [mapError, setMapError] = useState<unknown>(null);
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const isPurchase = data.material_request_type === "Purchase";
  const isTransferOrIssue = data.material_request_type === "Material Transfer" || data.material_request_type === "Material Issue";

  async function createDownstream(kind: "po" | "se") {
    setBusy(kind); setMapError(null);
    try {
      const call = kind === "po" ? makePO.call : makeSE.call;
      const doctype = kind === "po" ? DT.purchaseOrder : DT.stockEntry;
      const res = await call({ source_name: name });
      const mapped = res?.message;
      if (!mapped) throw new Error("Mapper returned nothing");
      const body: Record<string, unknown> = { ...(mapped as Record<string, unknown>) };
      delete body.name; delete body.doctype; delete body.__islocal; delete body.__unsaved;
      const created = await create.createDoc(doctype, body);
      const newName = (created as { name: string }).name;
      if (kind === "po") nav(`/purchase-orders/${encodeURIComponent(newName)}`);
      else nav(`/stock-entries/${encodeURIComponent(newName)}`);
    } catch (err) {
      setMapError(err);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/material-requests")}>{t("nav.materialRequests")}</button>}
        title={data.material_request_type || data.name}
        actions={
          <>
            {draft && (
              <button type="button" className="btn ghost"
                onClick={() => nav(`/material-requests/${encodeURIComponent(name)}/edit`)}>{t("inv.edit")}</button>
            )}
            {draft && canSubmit && (
              <button type="button" className="btn" disabled={submitCall.loading}
                onClick={() => void submitCall.call({ doc: { doctype: DT.materialRequest, name } }).then(() => mutate())}>
                {t("inv.submit")}
              </button>
            )}
            {submitted && isPurchase && (
              <button type="button" className="btn" disabled={!!busy}
                onClick={() => void createDownstream("po")}>
                {busy === "po" ? t("soc.saving") : t("mr.makePO")}
              </button>
            )}
            {submitted && isTransferOrIssue && (
              <button type="button" className="btn ghost" disabled={!!busy}
                onClick={() => void createDownstream("se")}>
                {busy === "se" ? t("soc.saving") : t("mr.makeSE")}
              </button>
            )}
            {submitted && canCancel && (
              <button type="button" className="btn quiet" disabled={cancelCall.loading}
                onClick={() => void cancelCall.call({ doctype: DT.materialRequest, name }).then(() => mutate())}>
                {t("inv.cancel")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={mrPill(data.status)}>{data.status || t("pay.status.Draft")}</Pill>
        </p>
      </PageHead>

      {(submitCall.error || cancelCall.error || mapError) && (
        <ErrorBox error={submitCall.error || cancelCall.error || mapError} />
      )}

      <FormLayout>
        <Card>
          <div className="fg">
            <ReadRow k={t("mr.purpose")} v={data.material_request_type || "—"} />
            <ReadRow k={t("quot.date")} v={date(data.transaction_date)} />
            <ReadRow k={t("mr.requiredBy")} v={date(data.schedule_date)} />
          </div>
        </Card>
        <Card title={t("mr.items")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th className="n">{t("sod.col.qty")}</th>
                  <th>{t("mr.warehouse")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                    <td><div className="icode">{l.item_code}</div><div className="iname">{l.item_name}</div></td>
                    <td className="n">{qty(l.qty)}<div style={{ fontSize: 11, color: "var(--faint)" }}>{l.uom}</div></td>
                    <td>{l.warehouse || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
