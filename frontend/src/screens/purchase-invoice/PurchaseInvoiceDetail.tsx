import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales } from "../../lib/roles";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";
import DetailActions from "../../components/DetailActions";

type Line = {
  name?: string; item_code?: string; item_name?: string; qty?: number; uom?: string;
  rate?: number; amount?: number; hs_code?: string; sac_code?: string;
};

type Doc = {
  name: string; supplier?: string; supplier_name?: string; supplier_address?: string;
  posting_date?: string; due_date?: string; bill_no?: string; bill_date?: string; company?: string;
  vat_emirate?: string; taxes_and_charges?: string; tax_id?: string;
  payment_terms_template?: string;
  net_total?: number; total_taxes_and_charges?: number; grand_total?: number;
  outstanding_amount?: number; currency?: string; total_advance?: number;
  allocate_advances_automatically?: number; advances?: unknown[];
  docstatus?: 0 | 1 | 2; status?: string;
  items?: Line[];
};

function printUrl(name: string): string {
  const p = new URLSearchParams({
    doctype: DT.purchaseInvoice,
    name,
    trigger_print: "1",
    format: "UAE Bilingual Purchase Invoice",
    no_letterhead: "0",
  });
  return `/printview?${p.toString()}`;
}

function piPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Paid") return "p-done";
  if (status === "Cancelled") return "p-cxl";
  if (status === "Overdue") return "p-warn";
  return "p-open";
}

export default function PurchaseInvoiceDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.purchaseInvoice, name);

  const payments = useFrappeGetCall<{
    message: { name: string; allocated?: number; ref?: string }[];
  }>(
    METHOD.getList,
    {
      doctype: DT.paymentEntry,
      fields: JSON.stringify([
        "name",
        "`tabPayment Entry Reference`.allocated_amount as allocated",
        "`tabPayment Entry Reference`.reference_name as ref",
      ]),
      filters: JSON.stringify([
        ["Payment Entry Reference", "reference_doctype", "=", DT.purchaseInvoice],
        ["Payment Entry Reference", "reference_name", "=", name],
        ["Payment Entry", "docstatus", "=", 1],
      ]),
      order_by: "posting_date desc",
      limit_page_length: 200,
    },
    name ? `pi-payments-${name}` : null,
  );

  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const amendCall = useFrappePostCall<{ message: { name: string } }>(METHOD.amend);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || session.currency || "";
  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const grand = data.grand_total ?? 0;
  const outstanding = data.outstanding_amount ?? 0;
  const paid = Math.max(grand - outstanding, 0);
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);
  const busyError = submitCall.error || cancelCall.error || payments.error;

  const allocations = Object.values(
    (payments.data?.message ?? [])
      .filter((r) => r.ref === name)
      .reduce<Record<string, { name: string; allocated: number }>>((acc, r) => {
        acc[r.name] ??= { name: r.name, allocated: 0 };
        acc[r.name].allocated += Number(r.allocated) || 0;
        return acc;
      }, {}),
  );

  const refresh = () => mutate();

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/purchase-invoices")}>
            {t("nav.purchaseInvoices")}
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
            canWrite={true}
            busy={submitCall.loading || cancelCall.loading || amendCall.loading}
            onEdit={() => nav(`/purchase-invoices/${encodeURIComponent(name)}/edit`)}
            onSubmit={() => void submitCall.call({ doc: { doctype: DT.purchaseInvoice, name } }).then(refresh)}
            onCancel={() => void cancelCall.call({ doctype: DT.purchaseInvoice, name }).then(refresh)}
            onAmend={async () => {
              const res = await amendCall.call({ doctype: DT.purchaseInvoice, name });
              const newName = res?.message?.name;
              if (newName) nav(`/purchase-invoices/${encodeURIComponent(newName)}`);
              else refresh();
            }}
            extra={
              <>
                {submitted && outstanding > 0 && (
                  <button type="button" className="btn"
                    onClick={() => nav(`/payments/new?type=Pay&invoice=${encodeURIComponent(name)}`)}>
                    {t("pi.pay")}
                  </button>
                )}
                {/* DebitNoteForm route. User: Implement the plan… complete all the to-dos. */}
                {submitted && (
                  <button type="button" className="btn ghost"
                    onClick={() => nav(`/purchase-invoices/${encodeURIComponent(name)}/return`)}>
                    {t("pi.debit")}
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={() => window.open(printUrl(name), "_blank", "noopener")}>
                  {t("inv.print")}
                </button>
              </>
            }
          />
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={piPill(data.status)}>{data.status || "—"}</Pill>
          {data.bill_no && <span className="pill p-flat">{data.bill_no}</span>}
        </p>
      </PageHead>

      {busyError && <ErrorBox error={busyError} />}

      <FormLayout aside={
        <>
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("inv.totals")}</h2>
            <SumRow k={t("sod.net")} v={money(data.net_total)} currency={cur} />
            <SumRow k={t("sod.vat")} v={money(data.total_taxes_and_charges)} currency={cur} />
            <SumRow k={t("sod.grand")} v={money(grand)} cls="rule total" currency={cur} />
            {submitted && <SumRow k={t("pi.paid")} v={money(paid)} cls="rule" currency={cur} />}
            {submitted && <SumRow k={t("inv.col.outstanding")} v={money(outstanding)} cls="due" currency={cur} />}
          </Card>
          <Card title={t("nav.payments")} bodyClass={null as unknown as string}>
            {payments.isLoading ? <Loading /> : allocations.length === 0 ? (
              <p className="sub" style={{ padding: 16 }}>{t("pi.noPayments")}</p>
            ) : allocations.map((p) => (
              <button type="button" className="doc" key={p.name}
                onClick={() => nav(`/payments/${encodeURIComponent(p.name)}`)}>
                <span className="t"><b>{p.name}</b></span>
                <span className="r">{money(p.allocated)}<small>{cur}</small></span>
              </button>
            ))}
          </Card>
        </>
      }>
        <Card title={t("inv.details")}>
          <div className="fg">
            <ReadRow k={t("nav.suppliers")} v={data.supplier_name || data.supplier} />
            <ReadRow k={t("pi.supplierTrn")} v={<span className="mono">{data.tax_id || "—"}</span>} />
            <ReadRow k={t("inv.date")} v={date(data.posting_date)} />
            <ReadRow k={t("inv.due")} v={date(data.due_date)} />
            <ReadRow k={t("pi.billNo")} v={data.bill_no || "—"} />
            <ReadRow k={t("pi.billDate")} v={date(data.bill_date)} />
            <ReadRow k={t("f.taxTemplate")} v={data.taxes_and_charges || "—"} />
            <ReadRow k={t("f.emirate")} v={data.vat_emirate || "—"} />
            {submitted && outstanding > 0
              && (Boolean(data.advances?.length) || data.allocate_advances_automatically != null)
              && data.total_advance != null ? (
              <ReadRow k={t("txn.totalAdvance")} v={money(data.total_advance)} />
            ) : null}
          </div>
        </Card>
        <Card title={t("inv.lines")} bodyClass="twrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 26 }}>#</th>
                <th>{t("soc.pickItem")}</th>
                <th className="n">{t("sod.col.qty")}</th>
                <th className="n">{t("sod.col.rate")}</th>
                <th className="n">{t("sod.col.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(data.items ?? []).map((l, i) => (
                <tr key={l.name ?? i}>
                  <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                  <td>
                    <div className="icode">{l.item_code}</div>
                    <div className="iname">{l.item_name}</div>
                    {(l.hs_code || l.sac_code) && (
                      <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
                        {l.hs_code ? `HS ${l.hs_code}` : ""}
                        {l.hs_code && l.sac_code ? " · " : ""}
                        {l.sac_code ? `SAC ${l.sac_code}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="n">{qty(l.qty)}<div style={{ fontSize: 11, color: "var(--faint)" }}>{l.uom}</div></td>
                  <td className="n">{money(l.rate)}</td>
                  <td className="n" style={{ fontWeight: 600 }}>{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </FormLayout>
    </>
  );
}
