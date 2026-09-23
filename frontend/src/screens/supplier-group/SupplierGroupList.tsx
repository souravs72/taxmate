/**
 * Supplier Group list. Route: /supplier-groups. Callers: App.tsx. Phase 10.
 * API: get_list on "Supplier Group".
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 50;
type Row = { name: string; parent_supplier_group?: string; is_group?: number };

export default function SupplierGroupList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["name", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.supplierGroup, {
    fields: ["name", "parent_supplier_group", "is_group"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.supplierGroup, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("sg.col.name"), cell: (r) => r.name },
    { key: "parent_supplier_group", header: t("sg.col.parent"), cell: (r) => r.parent_supplier_group ?? "" },
    { key: "is_group", header: t("sg.col.isGroup"), cell: (r) => r.is_group ? "✓" : "" },
  ];

  void session;
  return (
    <>
      <PageHead
        title={t("sg.title")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/supplier-groups/new")}>
              {t("sg.new")}
            </button>
          ) : null
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("sg.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/supplier-groups/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("sg.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
