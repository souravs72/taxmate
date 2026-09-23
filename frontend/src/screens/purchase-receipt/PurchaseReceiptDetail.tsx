/**
 * Purchase Receipt detail — submit, cancel, edit draft, PR → PI.
 * Callers: App.tsx /purchase-receipts/:name.
 * API: METHOD.submit, METHOD.cancel, METHOD.makePrPurchaseInvoice; insert Purchase Invoice.
 * Schema: Doc { name, supplier, docstatus, per_billed, items[] }.
 * User instruction: "Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself. … Don't stop until you have completed all the to-dos."
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales, canWrite } from "../../lib/roles";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";
import DetailActions from "../../components/DetailActions";

type Line = { item_code?: string; item_name?: string; qty?: number; uom?: string; rate?: number; amount?: number; warehouse?: string };
type Doc = {
  name: string; supplier?: string; supplier_name?: string; posting_date?: string;
  company?: string; status?: string; currency?: string; docstatus?: number;
  grand_total?: number; net_total?: number; total_taxes_and_charges?: number;
  per_billed?: number; is_return?: number; set_warehouse?: string; items?: Line[];
};

function prPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  if (status === "Return" || status === "Return Issued") return "p-warn";
  return "p-open";
}

export default function PurchaseReceiptDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.purchaseReceipt, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const makePi = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makePrPurchaseInvoice);
  const create = useInsert();
  const [busyPi, setBusyPi] = useState(false);
  const [mapError, setMapError] = useState<unknown>(null);

  async function createInvoice() {
    setBusyPi(true);
    setMapError(null);
    try {
      const res = await makePi.call({ source_name: name });
      const mapped = res?.message;
      if (!mapped) throw new Error("The mapper returned nothing.");
      const body: Record<string, unknown> = { ...mapped };
      delete body.name;
      delete body.doctype;
      delete body.__islocal;
      delete body.__unsaved;
      const created = await create.createDoc(DT.purchaseInvoice, body) as { name: string };
      nav(`/purchase-invoices/${encodeURIComponent(created.name)}`);
    } catch (err) {
      setMapError(err);
    } finally {
      setBusyPi(false);
    }
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || session.currency || "";
  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);
  const writable = canWrite(session);
  const busyError = submitCall.error || cancelCall.error || makePi.error || mapError;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/purchase-receipts")}>
            {t("nav.purchaseReceipts")}
          </button>
        }
        title={data.supplier_name || data.supplier || data.name}
        actions={
          <DetailActions
            draft={draft}
            submitted={submitted}
            cancelled={data.docstatus === 2}
            canSubmit={canSubmit}
            canCancel={canCancel}
            canWrite={writable}
            busy={submitCall.loading || cancelCall.loading || busyPi}
            onEdit={() => nav(`/purchase-receipts/${encodeURIComponent(name)}/edit`)}
            onSubmit={() => void submitCall.call({ doc: { doctype: DT.purchaseReceipt, name } }).then(() => mutate())}
            onCancel={() => void cancelCall.call({ doctype: DT.purchaseReceipt, name }).then(() => mutate())}
            extra={
              <>
                {submitted && writable && (data.per_billed ?? 0) < 100 && (
                  <button type="button" className="btn" disabled={busyPi} onClick={() => void createInvoice()}>
                    {busyPi ? t("soc.saving") : t("pr.createPi")}
                  </button>
                )}
                {submitted && !data.is_return && writable && (
                  <button type="button" className="btn ghost"
                    onClick={() => nav(`/purchase-receipts/${encodeURIComponent(name)}/return`)}>
                    {t("pr.return")}
                  </button>
                )}
              </>
            }
          />
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={prPill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>

      {busyError && <ErrorBox error={busyError} />}

      <FormLayout
        aside={
          <Card title={t("dn.summary")}>
            <ReadRow k={t("inv.col.date")} v={date(data.posting_date)} />
            <ReadRow k={t("nav.warehouses")} v={data.set_warehouse || "—"} />
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
                  <th>{t("nav.warehouses")}</th>
                  <th className="n">{t("dn.qty")}</th>
                  <th className="n">{t("dn.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((row, i) => (
                  <tr key={row.item_code ?? String(i)}>
                    <td>{row.item_name || row.item_code}</td>
                    <td>{row.warehouse || data.set_warehouse || "—"}</td>
                    <td className="n">{qty(row.qty)} {row.uom}</td>
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
