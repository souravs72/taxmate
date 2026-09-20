import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Doc = {
  name: string;
  company?: string;
  source?: string;
  status?: string;
  asp_document_id?: string;
  issue_date?: string;
  currency?: string;
  supplier_name?: string;
  supplier_trn?: string;
  total_amount?: number;
  tax_amount?: number;
  purchase_invoice?: string;
  payload?: string;
};

function inPill(status?: string): string {
  if (status === "Drafted") return "p-done";
  if (status === "Rejected") return "p-cxl";
  return "p-warn";
}

function prettyPayload(raw?: string): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function IncomingInvoiceDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.incomingInvoice, name);
  const draft = useFrappePostCall<{ message: string }>(METHOD.draftPurchaseInvoiceFromIncoming);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || session.currency || "";
  const received = data.status === "Received";
  const payload = prettyPayload(data.payload);

  async function draftPi() {
    const res = await draft.call({ name });
    const invoice = res?.message;
    await mutate();
    if (invoice) nav(`/purchase-invoices/${encodeURIComponent(invoice)}`);
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/incoming-invoices")}>
            {t("nav.incomingInvoices")}
          </button>
        }
        title={data.supplier_name || data.asp_document_id || data.name}
        actions={
          <>
            {received && (
              <button type="button" className="btn" disabled={draft.loading} onClick={() => void draftPi()}>
                {draft.loading ? t("soc.saving") : t("in.draftPi")}
              </button>
            )}
            {data.purchase_invoice && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => nav(`/purchase-invoices/${encodeURIComponent(data.purchase_invoice!)}`)}
              >
                {t("in.openPi")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={inPill(data.status)}>{data.status ? t(`in.status.${data.status}`) : "—"}</Pill>
          {data.source && <span className="pill p-flat">{data.source}</span>}
        </p>
      </PageHead>

      {draft.error && <ErrorBox error={draft.error} />}

      <FormLayout
        aside={
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("inv.totals")}</h2>
            <SumRow k={t("in.tax")} v={money(data.tax_amount)} currency={cur} />
            <SumRow k={t("sod.grand")} v={money(data.total_amount)} cls="rule total" currency={cur} />
          </Card>
        }
      >
        <Card>
          <ReadRow k={t("in.col.id")} v={data.asp_document_id || data.name} />
          <ReadRow k={t("nav.suppliers")} v={data.supplier_name || "—"} />
          <ReadRow k={t("pi.supplierTrn")} v={data.supplier_trn || "—"} />
          <ReadRow k={t("inv.col.date")} v={date(data.issue_date)} />
          <ReadRow k={t("in.company")} v={data.company || "—"} />
          {data.purchase_invoice && (
            <ReadRow k={t("pi.col.no")} v={data.purchase_invoice} />
          )}
        </Card>

        {payload && (
          <Card title={t("in.payload")} hint={t("in.payloadHint")}>
            <pre className="payload" style={{ margin: 0, maxHeight: 360, overflow: "auto", fontSize: 12 }}>
              {payload}
            </pre>
          </Card>
        )}
      </FormLayout>
    </>
  );
}
