import { useCallback } from "react";
/**
 * Customer Group list. Route: /customer-groups.
 * API: get_list on "Customer Group". Callers: App.tsx. Phase 10.
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 50;
type Row = { name: string; parent_customer_group?: string; is_group?: number };

export default function CustomerGroupList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["name", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.customerGroup, {
    fields: ["name", "parent_customer_group", "is_group"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.customerGroup, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("cg.col.name"), cell: (r) => r.name },
    { key: "parent_customer_group", header: t("cg.col.parent"), cell: (r) => r.parent_customer_group ?? "" },
    { key: "is_group", header: t("cg.col.isGroup"), cell: (r) => r.is_group ? "✓" : "" },
  ];

  void session;
  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.customerGroup,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, page],
  });

  return (
    <>
      <PageHead
        title={t("cg.title")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/customer-groups/new")}>
              {t("cg.new")}
            </button>
          ) : null
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("cg.search")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />
        {list.isLoading ? (
          <Loading />
        ) : (
        <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/customer-groups/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("cg.empty")}
            columns={columns}
            selection={draftDelete.selection(rows)}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
