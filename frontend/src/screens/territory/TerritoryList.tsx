/**
 * Territory list. Route: /territories. Callers: App.tsx. Phase 10.
 * API: get_list on "Territory". User instruction: Phase 10 territory list.
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
type Row = { name: string; parent_territory?: string; is_group?: number };

export default function TerritoryList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["name", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.territory, {
    fields: ["name", "parent_territory", "is_group"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.territory, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("ter.col.name"), cell: (r) => r.name },
    { key: "parent_territory", header: t("ter.col.parent"), cell: (r) => r.parent_territory ?? "" },
    { key: "is_group", header: t("ter.col.isGroup"), cell: (r) => r.is_group ? "✓" : "" },
  ];

  void session;
  return (
    <>
      <PageHead
        title={t("ter.title")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/territories/new")}>
              {t("ter.new")}
            </button>
          ) : null
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ter.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/territories/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("ter.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
