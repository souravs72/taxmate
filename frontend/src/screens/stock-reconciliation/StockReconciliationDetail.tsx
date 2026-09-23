/**
 * Stock Reconciliation detail. Importers: App.tsx. API: taxmate.api.resource.get on Stock Reconciliation.
 * Schema: name, purpose, posting_date, docstatus, items[{item_code,warehouse,qty,valuation_rate}].
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales } from "../../lib/roles";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Line = { item_code?: string; item_name?: string; warehouse?: string; qty?: number; valuation_rate?: number; };
type Doc = { name: string; purpose?: string; posting_date?: string; docstatus?: number; difference_account?: string; items?: Line[]; };

export default function StockReconciliationDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.stockReconciliation, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const pill = data.docstatus === 2 ? "p-cxl" : data.docstatus === 1 ? "p-done" : "p-draft";
  const label = data.docstatus === 2 ? t("pay.status.Cancelled") : data.docstatus === 1 ? t("pay.status.Submitted") : t("pay.status.Draft");

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/stock-reconciliations")}>
            {t("nav.stockReconciliations")}
          </button>
        }
        title={data.purpose || data.name}
        actions={
          <>
            {draft && (
              <button type="button" className="btn ghost"
                onClick={() => nav(`/stock-reconciliations/${encodeURIComponent(name)}/edit`)}>
                {t("inv.edit")}
              </button>
            )}
            {draft && canSubmit && (
              <button type="button" className="btn" disabled={submitCall.loading}
                onClick={() => void submitCall.call({ doc: { doctype: DT.stockReconciliation, name } }).then(() => mutate())}>
                {t("inv.submit")}
              </button>
            )}
            {submitted && canCancel && (
              <button type="button" className="btn quiet" disabled={cancelCall.loading}
                onClick={() => void cancelCall.call({ doctype: DT.stockReconciliation, name }).then(() => mutate())}>
                {t("inv.cancel")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={pill}>{label}</Pill>
        </p>
      </PageHead>

      {(submitCall.error || cancelCall.error) && (
        <ErrorBox error={submitCall.error || cancelCall.error} />
      )}

      <FormLayout>
        <Card>
          <div className="fg">
            <ReadRow k={t("sr.purpose")} v={data.purpose || "—"} />
            <ReadRow k={t("sr.check.date")} v={date(data.posting_date)} />
            {data.difference_account && (
              <ReadRow k={t("sr.differenceAccount")} v={data.difference_account} />
            )}
          </div>
        </Card>
        <Card title={t("sr.items")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th>{t("sr.warehouse")}</th>
                  <th className="n">{t("sr.qty")}</th>
                  <th className="n">{t("sr.rate")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((l, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                    <td>
                      <div className="icode">{l.item_code}</div>
                      <div className="iname">{l.item_name}</div>
                    </td>
                    <td>{l.warehouse || "—"}</td>
                    <td className="n">{qty(l.qty)}</td>
                    <td className="n">{money(l.valuation_rate)}</td>
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
