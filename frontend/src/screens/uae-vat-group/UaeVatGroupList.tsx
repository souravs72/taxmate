import { useCallback } from "react";
/**
 * UaeVatGroupList — Phase 22. List UAE VAT Groups.
 * Callers: App.tsx /uae-vat-groups
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
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 30;
type Row = { name: string; representative_company?: string; group_trn?: string; election_date?: string; docstatus?: number };

export default function UaeVatGroupList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["representative_company", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.uaeVatGroup, {
    fields: ["name", "representative_company", "group_trn", "election_date", "docstatus"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE, limit_start: start,
  });
  const count = useDocCount(DT.uaeVatGroup, filters as never);

  const columns: Column<Row>[] = [
    { key: "representative_company", header: t("uvg.col.representative"), cell: (r) => r.representative_company ?? "" },
    { key: "group_trn", header: t("uvg.col.trn"), cell: (r) => r.group_trn ?? "" },
    { key: "election_date", header: t("uvg.col.electionDate"), cell: (r) => r.election_date ?? "" },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.uaeVatGroup,
    onDone: refreshList,
    enabled: writable,
    clearDeps: [q, page],
  });

  return (
    <>
      <PageHead title={t("uvg.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/uae-vat-groups/new")}>{t("uvg.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("uvg.col.representative")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />
        {list.isLoading ? <Loading /> : (
        <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/uae-vat-groups/${encodeURIComponent(r.name)}`)}
            columns={columns}
            emptyLabel={t("uvg.empty")}
          selection={draftDelete.selection(rows)}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
