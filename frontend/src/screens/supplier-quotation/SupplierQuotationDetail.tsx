/**
 * SupplierQuotationDetail — Phase 16.
 * Callers: App.tsx /supplier-quotations/:name
 * API: taxmate.api.resource.get on "Supplier Quotation"
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";

type Line = { item_code?: string; item_name?: string; qty?: number; rate?: number; amount?: number; uom?: string };
type Doc = {
  name: string; supplier?: string; supplier_name?: string; transaction_date?: string;
  valid_till?: string; status?: string; grand_total?: number; net_total?: number;
  total_taxes_and_charges?: number; currency?: string; docstatus?: number; items?: Line[];
};

function sqPill(status?: string): string {
  if (!status || status === "Draft") return "p-draft";
  if (status === "Ordered") return "p-done";
  if (status === "Cancelled" || status === "Expired") return "p-cxl";
  return "p-open";
}

export default function SupplierQuotationDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.supplierQuotation, name);
  const makePo = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeSupplierQuotationPO);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const create = useInsert();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  async function createPO() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await makePo.call({ source_name: name });
      const mapped = res?.message;
      if (!mapped) throw new Error("Mapper returned nothing.");
      const body: Record<string, unknown> = { ...(mapped as Record<string, unknown>) };
      delete body.name; delete body.doctype; delete body.__islocal; delete body.__unsaved;
      const created = await create.createDoc(DT.purchaseOrder, body);
      nav(`/purchase-orders/${encodeURIComponent((created as { name: string }).name)}`);
    } catch (err) { setActionError(err); }
    finally { setBusy(false); }
  }

  async function doSubmit() {
    setBusy(true); setActionError(null);
    try { await submitCall.call({ doctype: DT.supplierQuotation, name }); mutate(); }
    catch (err) { setActionError(err); }
    finally { setBusy(false); }
  }

  async function doCancel() {
    setBusy(true); setActionError(null);
    try { await cancelCall.call({ doctype: DT.supplierQuotation, name }); mutate(); }
    catch (err) { setActionError(err); }
    finally { setBusy(false); }
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || "";

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/supplier-quotations")}>{t("sq.title")}</button>}
        title={data.name}
      >
        <Pill cls={sqPill(data.status)}>{data.status || "Draft"}</Pill>
        {writable && data.docstatus === 0 && (
          <>
            <button className="btn ghost" onClick={() => nav(`/supplier-quotations/${encodeURIComponent(name)}/edit`)}>{t("edit")}</button>
            <button className="btn" onClick={() => void doSubmit()} disabled={busy}>{t("sq.submit")}</button>
          </>
        )}
        {writable && data.docstatus === 1 && (
          <>
            <button className="btn" onClick={() => void createPO()} disabled={busy}>{t("sq.makePO")}</button>
            <button className="btn ghost" onClick={() => void doCancel()} disabled={busy}>{t("sq.cancel")}</button>
          </>
        )}
      </PageHead>
      {actionError ? <ErrorBox error={actionError} /> : null}
      <Card>
        <div className="fg">
          <ReadRow k={t("sq.col.supplier")} v={data.supplier_name || data.supplier || "—"} />
          <ReadRow k={t("sq.col.date")} v={date(data.transaction_date)} />
          <ReadRow k={t("sq.col.validTill")} v={date(data.valid_till)} />
        </div>
      </Card>
      <Card title={t("sq.items")}>
        <div className="twrap">
          <table>
            <thead><tr>
              <th>{t("sq.col.item")}</th>
              <th className="n">{t("sq.col.qty")}</th>
              <th className="n">{t("sq.col.rate")}</th>
              <th className="n">{t("sq.col.amount")}</th>
            </tr></thead>
            <tbody>
              {(data.items ?? []).map((l, i) => (
                <tr key={i}>
                  <td>{l.item_name || l.item_code || "—"}</td>
                  <td className="n">{l.qty}</td>
                  <td className="n">{cur} {money(l.rate)}</td>
                  <td className="n tot">{cur} {money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SumRow k={t("sq.subtotal")} v={`${cur} ${money(data.net_total)}`} />
        {data.total_taxes_and_charges ? <SumRow k={t("sq.taxes")} v={`${cur} ${money(data.total_taxes_and_charges)}`} /> : null}
        <SumRow k={t("sq.total")} v={`${cur} ${money(data.grand_total)}`} />
      </Card>
    </>
  );
}
