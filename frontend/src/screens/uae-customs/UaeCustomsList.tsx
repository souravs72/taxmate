import { useCallback } from "react";
/**
 * UaeCustomsList — Phase 22. List UAE Customs Declarations.
 * Callers: App.tsx /uae-customs-declarations
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
import { Card, Loading } from "../../components/ui";
import { ListScreen } from "../../components/screen";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 30;
type Row = { name: string; company?: string; posting_date?: string; declaration_number?: string; supplier?: string; docstatus?: number };

export default function UaeCustomsList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["declaration_number", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.uaeCustoms, {
    fields: ["name", "company", "posting_date", "declaration_number", "supplier", "docstatus"],
    filters: filters as never,
    orderBy: { field: "posting_date", order: "desc" },
    limit: PAGE, limit_start: start,
  });
  const count = useDocCount(DT.uaeCustoms, filters as never);

  const columns: Column<Row>[] = [
    { key: "posting_date", header: t("ucd.col.date"), cell: (r) => r.posting_date ?? "" },
    { key: "declaration_number", header: t("ucd.col.declNo"), cell: (r) => r.declaration_number ?? "" },
    { key: "supplier", header: t("ucd.col.supplier"), cell: (r) => r.supplier ?? "" },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.uaeCustoms,
    onDone: refreshList,
    enabled: writable,
    clearDeps: [q, page],
  });

  return (
    <ListScreen
        title={t("ucd.title")}
        primary={(
          <IfCanWrite>
            <button className="btn" onClick={() => nav("/uae-customs-declarations/new")}>{t("ucd.new")}</button>
          </IfCanWrite>
        )}
      >
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ucd.col.declNo")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />
        {list.isLoading ? <Loading /> : (
        <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/uae-customs-declarations/${encodeURIComponent(r.name)}`)}
            columns={columns}
            emptyLabel={t("ucd.empty")}
          selection={draftDelete.selection(rows)}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </ListScreen>
  );
}
