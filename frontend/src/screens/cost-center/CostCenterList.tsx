/**
 * CostCenterList — Phase 3.
 * Callers: App.tsx /cost-centers
 * API: taxmate.api.resource.get_list / bulk_delete on "Cost Center" (_CORE_MASTERS)
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import BulkDraftBar from "../../components/BulkDraftBar";
import { Card, PageHead } from "../../components/ui";
import { DataTable, type Column } from "../../components/DataTable";
import { IfCanWrite } from "../../components/RoleGate";

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
  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.costCenter,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [company],
  });

  const columns: Column<Row>[] = [
    { key: "name", header: t("cc.col.name"), cell: (r) => r.cost_center_name || r.name },
    { key: "parent", header: t("cc.col.parent"), cell: (r) => r.parent_cost_center || "—" },
    { key: "group", header: t("cc.col.isGroup"), cell: (r) => (r.is_group ? t("yes") : t("no")) },
  ];

  return (
    <>
      <PageHead
        title={t("cc.title")}
        actions={
          <IfCanWrite>
            <button type="button" className="btn" onClick={() => nav("/cost-centers/new")}>
              {t("cc.new")}
            </button>
          </IfCanWrite>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <BulkDraftBar drafts={draftDelete} />
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/cost-centers/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("cc.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
      </Card>
    </>
  );
}
