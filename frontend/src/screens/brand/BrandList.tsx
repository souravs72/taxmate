/**
 * Brand list. Callers: App.tsx /catalogue/brands.
 * API: taxmate.api.resource.get_list on "Brand".
 * User: "Brand — /catalogue/brands, /new, /:name"
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

type Row = { name: string };

export default function BrandList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = q.trim()
    ? [["name", "like", `%${q.trim()}%`]]
    : [];

  const list = useDocList<Row>(DT.brand, {
    fields: ["name"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.brand, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("brand.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
  ];

  return (
    <>
      <PageHead
        title={t("brand.title")}
        actions={
          <button type="button" className="btn" onClick={() => nav("/catalogue/brands/new")}>
            {t("brand.new")}
          </button>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("brand.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/catalogue/brands/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("brand.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
