/**
 * FiscalYearDetail — Phase 13.
 * Callers: App.tsx /fiscal-years/:name
 * API: taxmate.api.resource.get on "Fiscal Year" (_CORE_MASTERS)
 * Schema: {name, year_start_date:"YYYY-MM-DD", year_end_date:"YYYY-MM-DD", is_short_year:0|1, companies:[{company}]}
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

type Company = { company?: string };
type Doc = {
  name: string;
  year_start_date?: string;
  year_end_date?: string;
  is_short_year?: number;
  companies?: Company[];
};

export default function FiscalYearDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Fiscal Year", name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/fiscal-years")}>
            {t("fy.title")}
          </button>
        }
        title={data.name}
        actions={
          <>
            <DocHistory doctype="Fiscal Year" name={name} />
            <button className="btn ghost" onClick={() => nav(`/fiscal-years/${encodeURIComponent(data.name)}/edit`)}>
            {t("inv.edit")}
          </button>
          </>}
      >
        {data.is_short_year ? <Pill cls="p-flat">{t("fy.short")}</Pill> : null}
      </PageHead>

      <DocTabShell doctype={"Fiscal Year"} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
