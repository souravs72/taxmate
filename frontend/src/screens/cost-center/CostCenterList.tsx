/**
 * CostCenterList — Phase 3.
 * Callers: App.tsx /cost-centers
 * API: taxmate.api.resource.get_list on "Cost Center" (_CORE_MASTERS)
 */
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead } from "../../components/ui";

type Row = { name: string; cost_center_name?: string; parent_cost_center?: string; is_group?: number };

export default function CostCenterList() {
  const nav = useNavigate();
  const session = useSession();
  const company = session.company || "";

  const list = useDocList<Row>(DT.costCenter, {
    fields: ["name", "cost_center_name", "parent_cost_center", "is_group"],
    filters: company ? [["company", "=", company]] : [],
    orderBy: { field: "name", order: "asc" },
    limit: 100,
  });

  return (
    <>
      <PageHead
        title={t("cc.title")}
        actions={
          <button className="btn" onClick={() => nav("/cost-centers/new")}>{t("cc.new")}</button>
        }
      />
      {list.error && <ErrorBox error={list.error} onRetry={() => list.mutate()} />}
      <Card bodyClass={null as unknown as string}>
        {list.isLoading ? <Loading />
          : (list.data ?? []).length === 0 ? <Empty label={t("cc.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("cc.col.name")}</th>
                    <th>{t("cc.col.parent")}</th>
                    <th>{t("cc.col.isGroup")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(list.data ?? []).map((r) => (
                    <tr key={r.name} onClick={() => nav(`/cost-centers/${encodeURIComponent(r.name)}`)}>
                      <td><span className="ordno">{r.cost_center_name || r.name}</span></td>
                      <td>{r.parent_cost_center || "—"}</td>
                      <td>{r.is_group ? t("yes") : t("no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
