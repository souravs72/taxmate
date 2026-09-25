/**
 * Serial No list. Route: /serial-nos. API: taxmate.api.resource.get_list on "Serial No".
 * Callers: App.tsx. Phase 7 — Serial/Batch masters.
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
type Row = { name: string; item_code?: string; batch_no?: string; warehouse?: string; status?: string };

export default function SerialNoList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const item = get("item");

  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["name", "like", `%${q.trim()}%`]);
  if (item.trim()) filters.push(["item_code", "=", item.trim()]);

  const list = useDocList<Row>(DT.serialNo, {
    fields: ["name", "item_code", "batch_no", "warehouse", "status"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.serialNo, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("sn.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "item_code", header: t("sn.col.item"), cell: (r) => r.item_code ?? "" },
    { key: "batch_no", header: t("sn.col.batch"), cell: (r) => r.batch_no ?? "" },
    { key: "warehouse", header: t("sn.col.warehouse"), cell: (r) => r.warehouse ?? "" },
    { key: "status", header: t("sn.col.status"), cell: (r) => r.status ?? "" },
  ];

  return (
    <>
      <PageHead title={t("sn.title")} />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("sn.search")} />
          <SearchFilter value={item} onChange={(v) => set("item", v)} placeholder={t("sn.item")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/serial-nos/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("sn.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
