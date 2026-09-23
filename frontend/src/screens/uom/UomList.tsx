/**
 * UOM list. Callers: App.tsx /catalogue/uoms.
 * API: taxmate.api.resource.get_list on "UOM".
 * User: "UOM — /catalogue/uoms, /new, /:name Fields: uom_name, must_be_whole_number"
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

type Row = { name: string; must_be_whole_number?: number };

export default function UomList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = q.trim()
    ? [["name", "like", `%${q.trim()}%`]]
    : [];

  const list = useDocList<Row>(DT.uom, {
    fields: ["name", "must_be_whole_number"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.uom, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("uom.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "whole", header: t("uom.col.whole"), cell: (r) => r.must_be_whole_number ? t("yes") : t("no") },
  ];

  return (
    <>
      <PageHead
        title={t("uom.title")}
        actions={
          <button type="button" className="btn" onClick={() => nav("/catalogue/uoms/new")}>
            {t("uom.new")}
          </button>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("uom.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/catalogue/uoms/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("uom.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
