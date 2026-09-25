/**
 * CostCenterDetail — Phase 3.
 * Callers: App.tsx /cost-centers/:name
 * API: taxmate.api.resource.get on "Cost Center" (_CORE_MASTERS)
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  cost_center_name?: string;
  company?: string;
  parent_cost_center?: string;
  is_group?: number;
};

export default function CostCenterDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.costCenter, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/cost-centers")}>
            {t("cc.title")}
          </button>
        }
        title={data.cost_center_name || data.name}
        actions={
          <button className="btn ghost" onClick={() => nav(`/cost-centers/${encodeURIComponent(name)}/edit`)}>
            {t("inv.edit")}
          </button>
        }
      >
        {data.is_group ? <Pill cls="p-flat">{t("cc.col.isGroup")}</Pill> : null}
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("cc.col.name")} v={data.cost_center_name || data.name} />
          <ReadRow k={t("cc.col.company")} v={data.company || "—"} />
          <ReadRow k={t("cc.col.parent")} v={data.parent_cost_center || "—"} />
          <ReadRow k={t("cc.col.isGroup")} v={data.is_group ? t("yes") : t("no")} />
        </div>
      </Card>
    </>
  );
}
