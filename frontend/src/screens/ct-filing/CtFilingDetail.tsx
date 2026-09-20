/**
 * Importers: App.tsx /ct-filings/:name. Callers: CT list row, search.
 * API: taxmate.api.resource.get parent UAE CT Filing Log (adjustments nested).
 * Schema: tax_payable, taxable_profit, revenue, expenses, adjustments child UAE CT Adjustment Row.
 * User: "Task 15: CT filing, ESR, UBO, late filing — one DocType list at a time"
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Adj = { name?: string; adjustment_type?: string; category?: string; amount?: number; notes?: string };
type Doc = {
  name: string; company?: string; period_start?: string; period_end?: string;
  filing_due_date?: string; deadline_status?: string; company_trn?: string;
  revenue?: number; expenses?: number; accounting_profit?: number; taxable_profit?: number;
  tax_payable?: number; generated_on?: string; docstatus?: number; adjustments?: Adj[];
};

function deadlinePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Filed") return "p-done";
  return "p-open";
}

export default function CtFilingDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.ctFiling, name);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;
  const cur = session.currency || "";
  const rows = data.adjustments ?? [];
  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/ct-filings")}>{t("nav.ct")}</button>}
        title={data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={deadlinePill(data.deadline_status)}>{data.deadline_status || "—"}</Pill>
        </p>
      </PageHead>
      <FormLayout aside={
        <Card title={t("ct.summary")}>
          <SumRow k={t("ct.col.tax")} v={`${cur} ${money(data.tax_payable)}`} />
          <ReadRow k={t("ct.col.profit")} v={`${cur} ${money(data.taxable_profit)}`} />
          <ReadRow k={t("v201.col.due")} v={date(data.filing_due_date)} />
          <ReadRow k={t("v201.generated")} v={data.generated_on ? date(data.generated_on) : "—"} />
        </Card>
      }>
        <Card>
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
          <ReadRow k={t("v201.col.period")} v={`${date(data.period_start)} – ${date(data.period_end)}`} />
          <ReadRow k={t("v201.trn")} v={data.company_trn || "—"} />
          <ReadRow k={t("ct.revenue")} v={money(data.revenue)} />
          <ReadRow k={t("ct.expenses")} v={money(data.expenses)} />
          <ReadRow k={t("ct.accounting")} v={money(data.accounting_profit)} />
        </Card>
        <Card title={t("ct.adjustments")}>
          {rows.length === 0 ? <p className="sub">{t("ct.noAdj")}</p> : (
            <div className="twrap"><table>
              <thead><tr><th>{t("ct.adjType")}</th><th>{t("ct.adjCat")}</th><th className="n">{t("v201.amount")}</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.name}><td>{r.adjustment_type || "—"}</td><td>{r.category || r.notes || "—"}</td><td className="n">{money(r.amount)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </FormLayout>
    </>
  );
}
