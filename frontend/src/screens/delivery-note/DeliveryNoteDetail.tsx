/**
 * Delivery Note detail — submit, cancel, and bill (DN → SI).
 * Route: App.tsx /delivery-notes/:name. API: METHOD.submit/cancel/makeDnSalesInvoice.
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
  name: string; customer?: string; customer_name?: string; posting_date?: string;
  company?: string; status?: string; docstatus?: number; currency?: string;
  grand_total?: number; net_total?: number; total_taxes_and_charges?: number;
  per_billed?: number; is_return?: number; set_warehouse?: string; items?: Line[];
};

function dnPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  if (status === "Return" || status === "Return Issued") return "p-warn";
  return "p-open";
}

export default function DeliveryNoteDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.deliveryNote, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const makeSi = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeDnSalesInvoice);
  const create = useInsert();
  const [busySi, setBusySi] = useState(false);
  const [mapError, setMapError] = useState<unknown>(null);

  async function createInvoice() {
    setBusySi(true);
    setMapError(null);
    try {
      const res = await makeSi.call({ source_name: name });
      const mapped = res?.message;
      if (!mapped) throw new Error("The mapper returned nothing.");
      const body: Record<string, unknown> = { ...mapped };
      delete body.name;
      delete body.doctype;
      delete body.__islocal;
      delete body.__unsaved;
      const created = await create.createDoc(DT.salesInvoice, body) as { name: string };
      nav(`/invoices/${encodeURIComponent(created.name)}`);
    } catch (err) {
      setMapError(err);
    } finally {
      setBusySi(false);
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
  const busyError = submitCall.error || cancelCall.error || makeSi.error || mapError;

  return (
    <>
      <PageHead
        title={data.customer_name || data.customer || data.name}
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/delivery-notes")}>
            {t("dn.title")}
          </button>
        }
        actions={
          <DetailActions
            draft={draft}
            submitted={submitted}
            cancelled={data.docstatus === 2}
            canSubmit={canSubmit}
            canCancel={canCancel}
            canWrite={writable}
            busy={submitCall.loading || cancelCall.loading || busySi}
            onEdit={() => nav(`/delivery-notes/${encodeURIComponent(name)}/edit`)}
            onSubmit={() => void submitCall.call({ doc: { doctype: DT.deliveryNote, name } }).then(() => mutate())}
            onCancel={() => void cancelCall.call({ doctype: DT.deliveryNote, name }).then(() => mutate())}
            extra={
              <>
                {submitted && writable && (data.per_billed ?? 0) < 100 && (
                  <button type="button" className="btn" disabled={busySi} onClick={() => void createInvoice()}>
                    {busySi ? t("soc.saving") : t("dn.createSi")}
                  </button>
                )}
                {submitted && !data.is_return && writable && (
                  <button type="button" className="btn ghost"
                    onClick={() => nav(`/delivery-notes/${encodeURIComponent(name)}/return`)}>
                    {t("dn.return")}
                  </button>
                )}
              </>
            }
          />
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={dnPill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>

      {busyError && <ErrorBox error={busyError} />}

      <FormLayout
        aside={
          <Card title={t("dn.summary")}>
            <ReadRow k={t("dn.date")} v={date(data.posting_date)} />
            <ReadRow k={t("dn.status")} v={data.status} />
            <ReadRow k={t("nav.warehouses")} v={data.set_warehouse || "—"} />
            <SumRow k={t("dn.net")} v={money(data.net_total)} currency={cur} />
            <SumRow k={t("dn.tax")} v={money(data.total_taxes_and_charges)} currency={cur} />
            <SumRow k={t("dn.grand")} v={money(data.grand_total)} currency={cur} cls="rule total" />
          </Card>
        }
      >
        <Card title={t("dn.items")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("dn.item")}</th>
                  <th>{t("dn.warehouse")}</th>
                  <th className="n">{t("dn.qty")}</th>
                  <th className="n">{t("dn.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((row, i) => (
                  <tr key={row.item_code ?? i}>
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
