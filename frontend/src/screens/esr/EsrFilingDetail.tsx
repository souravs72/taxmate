/**
 * ESR filing detail.
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Act = {
  name?: string;
  activity?: string;
  income_from_activity?: number;
  employee_count?: number;
  is_core_income_generating_activity_in_uae?: number;
};
type Doc = {
  name: string;
  company?: string;
  financial_year_start?: string;
  financial_year_end?: string;
  licence_authority?: string;
  status?: string;
  has_relevant_activity?: number;
  is_exempt?: number;
  exemption_reason?: string;
  notification_due_date?: string;
  notification_filed_on?: string;
  notification_reference?: string;
  report_due_date?: string;
  report_filed_on?: string;
  report_reference?: string;
  notes?: string;
  activities?: Act[];
};

function esrPill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Complete") return "p-done";
  if (status === "Report Due" || status === "Notification Due") return "p-warn";
  return "p-open";
}

export default function EsrFilingDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.esrFiling, name);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;
  const acts = data.activities ?? [];
  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/esr")}>{t("nav.esr")}</button>}
        title={data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={esrPill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
          <ReadRow k={t("esr.col.year")} v={`${date(data.financial_year_start)} – ${date(data.financial_year_end)}`} />
          <ReadRow k={t("esr.col.auth")} v={data.licence_authority || "—"} />
          <ReadRow k={t("esr.relevant")} v={data.has_relevant_activity ? t("yes") : t("no")} />
          <ReadRow k={t("esr.exempt")} v={data.is_exempt ? (data.exemption_reason || t("yes")) : t("no")} />
          <ReadRow k={t("esr.col.notify")} v={date(data.notification_due_date)} />
          <ReadRow k={t("esr.notifFiled")} v={data.notification_filed_on ? date(data.notification_filed_on) : "—"} />
          <ReadRow k={t("esr.col.report")} v={date(data.report_due_date)} />
          <ReadRow k={t("esr.reportFiled")} v={data.report_filed_on ? date(data.report_filed_on) : "—"} />
        </div>
        {data.notes ? (
          <div>
            <ReadRow k={t("v201.notes")} v={data.notes} />
          </div>
        ) : null}
      </Card>
      {acts.length > 0 ? (
        <Card title={t("esr.activities")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("esr.activity")}</th>
                  <th className="n">{t("esr.income")}</th>
                  <th className="n">{t("esr.employees")}</th>
                  <th>{t("esr.ciga")}</th>
                </tr>
              </thead>
              <tbody>
                {acts.map((a) => (
                  <tr key={a.name}>
                    <td>{a.activity || "—"}</td>
                    <td className="n">{money(a.income_from_activity)}</td>
                    <td className="n">{a.employee_count ?? "—"}</td>
                    <td>{a.is_core_income_generating_activity_in_uae ? t("yes") : t("no")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
