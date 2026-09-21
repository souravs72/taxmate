import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Line = {
  item_code?: string; item_name?: string; qty?: number; received_qty?: number;
  billed_amt?: number; uom?: string; rate?: number; amount?: number;
};
type Doc = {
  name: string; supplier?: string; supplier_name?: string; transaction_date?: string;
  schedule_date?: string; company?: string; status?: string; currency?: string;
  grand_total?: number; net_total?: number; total_taxes_and_charges?: number;
  docstatus?: number; per_received?: number; per_billed?: number;
  items?: Line[];
};

function poPill(status?: string): string {
  if (status === "Draft" || status === "On Hold") return "p-draft";
  if (status === "Completed" || status === "Delivered") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  return "p-open";
}

export default function PurchaseOrderDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.purchaseOrder, name);
  const makePr = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makePurchaseReceipt);
  const makePi = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makePurchaseInvoice);
  const create = useInsert();
  const [busy, setBusy] = useState<"" | "pr" | "pi">("");
  const [mapError, setMapError] = useState<unknown>(null);

  async function createDownstream(kind: "pr" | "pi") {
    setBusy(kind);
    setMapError(null);
    try {
      const call = kind === "pr" ? makePr.call : makePi.call;
      const doctype = kind === "pr" ? DT.purchaseReceipt : DT.purchaseInvoice;
      const res = await call({ source_name: name });
      const mapped = res?.message;
      if (!mapped) throw new Error("The mapper returned nothing.");
      const body: Record<string, unknown> = { ...(mapped as Record<string, unknown>) };
      delete body.name;
      delete body.doctype;
      delete body.__islocal;
      delete body.__unsaved;
      const created = await create.createDoc(doctype, body);
      const newName = (created as { name: string }).name;
      if (kind === "pi") nav(`/purchase-invoices/${encodeURIComponent(newName)}`);
      else nav(`/purchase-receipts/${encodeURIComponent(newName)}`);
    } catch (err) {
      setMapError(err);
    } finally {
      setBusy("");
    }
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || "";

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/purchase-orders")}>
            {t("nav.purchaseOrders")}
          </button>
        }
        title={data.supplier_name || data.supplier || data.name}
        actions={
          writable ? (
            <>
              <button type="button" className="btn ghost"
                disabled={!!busy || data.docstatus !== 1 || (data.per_received ?? 0) >= 100}
                onClick={() => void createDownstream("pr")}>
                {busy === "pr" ? t("soc.saving") : t("po.receive")}
              </button>
              <button type="button" className="btn"
                disabled={!!busy || data.docstatus !== 1 || (data.per_billed ?? 0) >= 100}
                onClick={() => void createDownstream("pi")}>
                {busy === "pi" ? t("soc.saving") : t("po.bill")}
              </button>
            </>
          ) : null
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={poPill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>

      {(mapError || makePr.error || makePi.error) && (
        <ErrorBox error={mapError ?? makePr.error ?? makePi.error} />
      )}

      <FormLayout
        aside={
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("dn.summary")}</h2>
            <ReadRow k={t("so.col.orderDate")} v={date(data.transaction_date)} />
            <ReadRow k={t("po.required")} v={date(data.schedule_date)} />
            <SumRow k={t("sod.net")} v={money(data.net_total)} currency={cur} />
            <SumRow k={t("sod.vat")} v={money(data.total_taxes_and_charges)} currency={cur} />
            <SumRow k={t("sod.grand")} v={money(data.grand_total)} cls="rule total" currency={cur} />
          </Card>
        }
      >
        <Card title={t("dn.items")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("dn.item")}</th>
                  <th className="n">{t("dn.qty")}</th>
                  <th className="n">{t("po.received")}</th>
                  <th className="n">{t("po.billed")}</th>
                  <th className="n">{t("dn.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((row, i) => (
                  <tr key={row.item_code ?? String(i)}>
                    <td>{row.item_name || row.item_code}</td>
                    <td className="n">{qty(row.qty)} {row.uom}</td>
                    <td className="n">{qty(row.received_qty)}</td>
                    <td className="n">{money(row.billed_amt)}</td>
                    <td className="n tot">{money(row.amount)}</td>
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
