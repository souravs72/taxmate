/**
 * Late filing notice detail.
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string; company?: string; obligation?: string; status?: string; due_date?: string;
  days_late?: number; source_doctype?: string; source_name?: string; guidance?: string;
};

function latePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Cleared") return "p-done";
  return "p-open";
}

export default function LateFilingDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.lateFiling, name);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;
  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/late-filings")}>{t("nav.lateFilings")}</button>}
        title={data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={latePill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
          <ReadRow k={t("lf.col.obligation")} v={data.obligation || "—"} />
          <ReadRow k={t("lf.col.source")} v={data.source_name ? `${data.source_doctype || ""} ${data.source_name}` : "—"} />
          <ReadRow k={t("v201.col.due")} v={date(data.due_date)} />
          <ReadRow k={t("lf.col.days")} v={String(data.days_late ?? 0)} />
        </div>
        {data.guidance ? (
          <div>
            <ReadRow k={t("lf.guidance")} v={data.guidance} />
          </div>
        ) : null}
      </Card>
    </>
  );
}
