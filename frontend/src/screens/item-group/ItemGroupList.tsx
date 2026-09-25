/**
 * Item Group list. Callers: App.tsx /catalogue/item-groups.
 * API: taxmate.api.resource.get_list on "Item Group".
 * User: "Item Group — /catalogue/item-groups, /new, /:name"
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 30;

type Row = { name: string; parent_item_group?: string; is_group?: number };

export default function ItemGroupList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string | number][] = q.trim()
    ? [["name", "like", `%${q.trim()}%`]]
    : [];

  const list = useDocList<Row>(DT.itemGroup, {
    fields: ["name", "parent_item_group", "is_group"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.itemGroup, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("ig.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "parent", header: t("ig.col.parent"), cell: (r) => r.parent_item_group || "—" },
    { key: "isGroup", header: t("ig.col.isGroup"), cell: (r) => r.is_group ? t("yes") : t("no") },
  ];

  return (
    <>
      <PageHead
        title={t("ig.title")}
        actions={
          <button type="button" className="btn" onClick={() => nav("/catalogue/item-groups/new")}>
            {t("ig.new")}
          </button>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ig.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/catalogue/item-groups/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("ig.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
