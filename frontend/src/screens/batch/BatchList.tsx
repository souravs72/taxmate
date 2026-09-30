import { useCallback } from "react";
/**
 * Batch list. Route: /batches. API: taxmate.api.resource.get_list on "Batch".
 * Callers: App.tsx. Phase 7.
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 30;
type Row = { name: string; item?: string; expiry_date?: string; manufacturing_date?: string };

export default function BatchList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const item = get("item");

  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["name", "like", `%${q.trim()}%`]);
  if (item.trim()) filters.push(["item", "=", item.trim()]);

  const list = useDocList<Row>(DT.batch, {
    fields: ["name", "item", "expiry_date", "manufacturing_date"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.batch, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("batch.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "item", header: t("batch.col.item"), cell: (r) => r.item ?? "" },
    { key: "expiry_date", header: t("batch.col.expiry"), cell: (r) => r.expiry_date ?? "" },
    { key: "manufacturing_date", header: t("batch.col.mfg"), cell: (r) => r.manufacturing_date ?? "" },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.batch,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, item, page],
  });

  return (
    <>
      <PageHead title={t("batch.title")} />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("batch.search")} />
          <SearchFilter value={item} onChange={(v) => set("item", v)} placeholder={t("batch.item")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />
        {list.isLoading ? (
          <Loading />
        ) : (
        <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/batches/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("batch.empty")}
            columns={columns}
            selection={draftDelete.selection(rows)}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
