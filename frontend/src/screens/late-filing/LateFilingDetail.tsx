/**
 * Late filing notice detail.
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t, tStatus } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

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
        actions={<DocHistory doctype={DT.lateFiling} name={name} />}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={latePill(data.status)}>{tStatus(data.status)}</Pill>
        </p>
      </PageHead>

      <DocTabShell doctype={DT.lateFiling} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
