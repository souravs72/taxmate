import { useCallback } from "react";
/**
 * UaeRelatedPartyList — Phase 22. List UAE CT Related Party disclosures.
 * Callers: App.tsx /uae-related-parties
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
type Row = { name: string; company?: string; party_type?: string; party?: string; relationship?: string };

export default function UaeRelatedPartyList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["party", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.uaeRelatedParty, {
    fields: ["name", "company", "party_type", "party", "relationship"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE, limit_start: start,
  });
  const count = useDocCount(DT.uaeRelatedParty, filters as never);

  const columns: Column<Row>[] = [
    { key: "company", header: t("urp.col.company"), cell: (r) => r.company ?? "" },
    { key: "party_type", header: t("urp.col.partyType"), cell: (r) => r.party_type ?? "" },
    { key: "party", header: t("urp.col.party"), cell: (r) => r.party ?? "" },
    { key: "relationship", header: t("urp.col.relationship"), cell: (r) => r.relationship ?? "" },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.uaeRelatedParty,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, page],
  });

  return (
    <ListScreen
        title={t("urp.title")}
        primary={(
          <IfCanWrite>
            <button className="btn" onClick={() => nav("/uae-related-parties/new")}>{t("urp.new")}</button>
          </IfCanWrite>
        )}
      >
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("urp.col.party")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />
        {list.isLoading ? <Loading /> : (
        <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/uae-related-parties/${encodeURIComponent(r.name)}`)}
            columns={columns}
            emptyLabel={t("urp.empty")}
          selection={draftDelete.selection(rows)}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </ListScreen>
  );
}
