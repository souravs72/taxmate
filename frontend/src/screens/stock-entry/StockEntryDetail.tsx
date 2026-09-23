/**
 * Stock Entry detail view. Read-only after submit.
 * Importers: App.tsx route /stock-entries/:name.
 * API: taxmate.api.resource.get on Stock Entry; taxmate.api.workflow.submit/cancel.
 * Schema: Stock Entry fields name, stock_entry_type, posting_date, company, docstatus, items[].
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales, canWrite } from "../../lib/roles";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";
import DetailActions from "../../components/DetailActions";

type Line = {
  item_code?: string; item_name?: string; qty?: number; uom?: string;
  basic_rate?: number; valuation_rate?: number; amount?: number;
  s_warehouse?: string; t_warehouse?: string;
};

type Doc = {
  name: string;
  stock_entry_type?: string;
  posting_date?: string;
  company?: string;
  docstatus?: number;
  total_amount?: number;
  items?: Line[];
  additional_costs?: { expense_account?: string; description?: string; amount?: number }[];
};

function sePill(ds?: number): string {
  if (ds === 2) return "p-cxl";
  if (ds === 1) return "p-done";
  return "p-draft";
}
function seLabel(ds?: number): string {
  if (ds === 2) return t("pay.status.Cancelled");
  if (ds === 1) return t("pay.status.Submitted");
  return t("pay.status.Draft");
}

export default function StockEntryDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.stockEntry, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const cancelled = data.docstatus === 2;
  const writable = canWrite(session);
  const busy = submitCall.loading || cancelCall.loading;
  const total = data.total_amount
    ?? (data.items ?? []).reduce((s, l) => s + (Number(l.amount) || 0), 0);

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/stock-entries")}>
            {t("nav.stockEntries")}
          </button>
        }
        title={data.stock_entry_type || data.name}
        actions={
          <DetailActions
            draft={draft}
            submitted={submitted}
            cancelled={cancelled}
            canSubmit={canSubmit}
            canCancel={canCancel}
            canWrite={writable}
            busy={busy}
            onEdit={() => nav(`/stock-entries/${encodeURIComponent(name)}/edit`)}
            onSubmit={() => void submitCall.call({ doc: { doctype: DT.stockEntry, name } }).then(() => mutate())}
            onCancel={() => void cancelCall.call({ doctype: DT.stockEntry, name }).then(() => mutate())}
          />
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={sePill(data.docstatus)}>{seLabel(data.docstatus)}</Pill>
        </p>
      </PageHead>

      {(submitCall.error || cancelCall.error) && (
        <ErrorBox error={submitCall.error || cancelCall.error} />
      )}

      <FormLayout aside={
        <Card bodyClass="cbody">
          <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("se.summary")}</h2>
          <SumRow k={t("se.total")} v={money(total)} />
            {(data.additional_costs ?? []).length > 0 && (
              <SumRow k={t("se.totalCosts")} v={money((data.additional_costs ?? []).reduce((s, c) => s + (Number(c.amount) || 0), 0))} />
            )}
        </Card>
      }>
        <Card>
          <div className="fg">
            <ReadRow k={t("se.purpose")} v={data.stock_entry_type || "—"} />
            <ReadRow k={t("se.check.date")} v={date(data.posting_date)} />
            <ReadRow k={t("coa.company")} v={data.company || "—"} />
          </div>
        </Card>
        <Card title={t("se.items")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th className="n">{t("sod.col.qty")}</th>
                  <th>{t("se.warehouse.from")}</th>
                  <th>{t("se.warehouse.to")}</th>
                  <th className="n">{t("sod.col.amount")}</th>
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
                    <td className="n">{qty(l.qty)}<div style={{ fontSize: 11, color: "var(--faint)" }}>{l.uom}</div></td>
                    <td>{l.s_warehouse || "—"}</td>
                    <td>{l.t_warehouse || "—"}</td>
                    <td className="n">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {(data.additional_costs ?? []).length > 0 && (
          <Card title={t("se.costs")}>
            <div className="twrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("se.costAccount")}</th>
                    <th>{t("se.costDesc")}</th>
                    <th className="n">{t("se.costAmt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.additional_costs ?? []).map((c, i) => (
                    <tr key={i}>
                      <td>{c.expense_account || "—"}</td>
                      <td>{c.description || "—"}</td>
                      <td className="n">{money(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </FormLayout>
    </>
  );
}
