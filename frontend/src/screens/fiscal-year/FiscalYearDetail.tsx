/**
 * FiscalYearDetail — Phase 13.
 * Callers: App.tsx /fiscal-years/:name
 * API: taxmate.api.resource.get on "Fiscal Year" (_CORE_MASTERS)
 * Schema: {name, year_start_date:"YYYY-MM-DD", year_end_date:"YYYY-MM-DD", is_short_year:0|1, companies:[{company}]}
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

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
      >
        {data.is_short_year ? <Pill cls="p-flat">{t("fy.short")}</Pill> : null}
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("fy.col.start")} v={date(data.year_start_date)} />
          <ReadRow k={t("fy.col.end")} v={date(data.year_end_date)} />
        </div>
      </Card>
      {(data.companies ?? []).length > 0 && (
        <Card title={t("fy.companies")}>
          <div className="fg">
            {(data.companies ?? []).map((c, i) => (
              <ReadRow key={i} k={t("coa.company")} v={c.company || "—"} />
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
