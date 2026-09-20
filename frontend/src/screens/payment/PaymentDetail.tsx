import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { date, money } from "../../lib/format";
import {
  PARTY_TYPE, PAY_PILL, canCancelPayment, payStatus, round2, type PayType,
} from "../../lib/payments";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";
import { FormLayout } from "../../components/form";
import { DirChip } from "./PaymentList";

type Ref = {
  name?: string;
  reference_doctype?: string;
  reference_name?: string;
  payment_term?: string;
  allocated_amount?: number;
  outstanding_amount?: number;
  total_amount?: number;
};

type Doc = {
  name: string;
  payment_type?: PayType; party_type?: string; party?: string; party_name?: string;
  posting_date?: string; mode_of_payment?: string;
  paid_amount?: number; received_amount?: number;
  total_allocated_amount?: number; unallocated_amount?: number;
  reference_no?: string; reference_date?: string;
  company?: string; docstatus?: number; status?: string; owner?: string;
  references?: Ref[];
};

export default function PaymentDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();

  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.paymentEntry, name);
  const cancelCall = useFrappePostCall(METHOD.cancel);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = session.currency || "";
  const st = payStatus(data);
  const type: PayType = data.payment_type ?? "Receive";
  const amount = round2(data.paid_amount ?? 0);
  /* Stored columns — set_amounts() runs inside validate(), so these are the
     server's own figures, not a client-side re-derivation.               */
  const allocated = round2(data.total_allocated_amount ?? 0);
  const unallocated = round2(data.unallocated_amount ?? (amount - allocated));
  const refs = data.references ?? [];

  /* ERPNext grants cancel on Payment Entry to Accounts User and Accounts
     Manager. The period-closed and frozen-date gates are enforced server
     side on the GL reversal, so the button stays and the error surfaces. */
  const canCancel = canCancelPayment(session.roles) && data.docstatus === 1;

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <a onClick={() => nav("/payments")} style={{ color: "var(--brand)", cursor: "pointer" }}>
              {t("nav.payments")}
            </a>{" / "}{data.name}
          </>
        }
        title={data.party_name || data.party}
        actions={
          <>
            <button className="btn ghost"
              onClick={() => window.open(printUrl(data.name), "_blank", "noopener")}>
              {t("pay.print")}
            </button>
            {canCancel && (
              <button className="btn quiet" disabled={cancelCall.loading}
                onClick={() => void cancelCall.call({ doctype: DT.paymentEntry, name }).then(() => mutate())}>
                {cancelCall.loading ? t("soc.saving") : t("pay.cancel")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 7 }}>
          <Pill cls={PAY_PILL[st]}>{t(`pay.status.${st}`)}</Pill>
          <DirChip type={type} />
          {data.mode_of_payment && <span className="pill p-flat">{data.mode_of_payment}</span>}
          {data.reference_no && <span className="pill p-flat mono">{data.reference_no}</span>}
        </p>
      </PageHead>

      {cancelCall.error && <ErrorBox error={cancelCall.error} />}

      <Card bodyClass="cbody">
        <div className="srow" style={{ paddingBlock: 0 }}>
          <span className="k">{t("pay.sAmount")}</span>
          <span className="v" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.025em" }}>
            <span className="cur">{cur}</span>{money(amount)}
          </span>
        </div>
        <div className="allocbar" style={{ height: 12 }}>
          <i style={{ width: `${amount ? (allocated / amount) * 100 : 0}%`, background: "var(--c-billed)" }} />
          <i style={{ width: `${amount ? Math.max(0, (unallocated / amount) * 100) : 0}%`, background: "var(--warn)" }} />
        </div>
        <div className="paylegend">
          <span>
            <i style={{ background: "var(--c-billed)" }} />
            {t("pay.allocated")} <b>{cur} {money(allocated)}</b>
          </span>
          <span>
            <i style={{ background: "var(--warn)" }} />
            {t("pay.unallocated")} <b>{cur} {money(unallocated)}</b>
          </span>
        </div>
      </Card>

      <FormLayout aside={
        <>
          {unallocated > 0.005 && (
            <div className="alert">
              <span className="ic">!</span>
              <span>
                <b>{t("pay.unallocated")} — {cur} {money(unallocated)}</b>
                {t("pay.warn.leftB")}
              </span>
            </div>
          )}
          <div className="note">
            <span className="ic">✦</span>
            <span><b>{t("pay.noteT")}</b>{t("pay.noteB")}</span>
          </div>
        </>
      }>
          <Card title={t("pay.hDet")} hint={t("pay.hDetH")}>
            <div className="fg">
              <ReadRow k={t("pay.lType")} v={t(`pay.type.${type}`)} />
              <ReadRow k={t(`pay.party.${data.party_type ?? PARTY_TYPE[type]}`)}
                       v={data.party_name || data.party || "—"} />
              <ReadRow k={t("pay.lDate")} v={date(data.posting_date)} />
              <ReadRow k={t("pay.mode")} v={data.mode_of_payment || "—"} />
              <ReadRow k={t("pay.refNo")} v={<span className="mono">{data.reference_no || "—"}</span>} />
              <ReadRow k={t("pay.refDate")} v={date(data.reference_date)} />
            </div>
          </Card>

          <Card title={t("pay.hClear")} hint={t("pay.hClearH")} bodyClass={null as unknown as string}>
            {refs.length === 0 ? <Empty label={t("pay.noAllocations")} /> : (
              <div className="twrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("pay.aInv")}</th>
                      <th className="n">{t("pay.cleared")}</th>
                      <th className="n">{t("pay.remaining")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refs.map((r, i) => {
                      const alloc = Number(r.allocated_amount) || 0;
                      const totalAmt = Number(r.total_amount) || 0;
                      const link = r.reference_doctype === DT.salesInvoice
                        ? `/invoices/${encodeURIComponent(r.reference_name ?? "")}` : "";
                      return (
                        <tr key={r.name ?? i}>
                          <td className="inv">
                            {link
                              ? <b><a style={{ color: "var(--brand)", cursor: "pointer" }}
                                      onClick={() => nav(link)}>{r.reference_name}</a></b>
                              : <b>{r.reference_name}</b>}
                            <span>{r.reference_doctype}{r.payment_term ? ` · ${r.payment_term}` : ""}</span>
                          </td>
                          <td className="n">{money(alloc)}</td>
                          <td className="n" style={{ color: "var(--muted)" }}>
                            {totalAmt ? money(Math.max(0, totalAmt - alloc)) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
      </FormLayout>
    </>
  );
}

/** Frappe's own print view. "Bank and Cash Payment Voucher" is the only
    Payment Entry format ERPNext ships; a missing format falls back to
    Standard rather than erroring (printview.py:133). */
function printUrl(name: string): string {
  const p = new URLSearchParams({
    doctype: DT.paymentEntry,
    name,
    trigger_print: "1",
    format: "Bank and Cash Payment Voucher",
    no_letterhead: "0",
  });
  return `/printview?${p.toString()}`;
}
