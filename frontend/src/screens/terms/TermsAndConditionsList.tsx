import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
/**
 * TermsAndConditionsList — Phase 15.
 * Callers: App.tsx /terms-and-conditions; nav.ts nav.termsAndConditions
 * API: taxmate.api.resource.get_list on "Terms and Conditions" (_CORE_MASTERS)
 * Schema: {name, title, buying:0|1, selling:0|1}
 */
import {useMemo, useCallback} from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, Pill } from "../../components/ui";
import { ListScreen } from "../../components/screen";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = { name: string; title?: string; buying?: number; selling?: number };

export default function TermsAndConditionsList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["title", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>("Terms and Conditions", {
    fields: ["name", "title", "buying", "selling"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("tc.col.name"),
      cell: (r) => <span className="ordno">{r.title || r.name}</span>,
    },
    {
      key: "scope",
      header: t("tc.col.scope"),
      cell: (r) => (
        <span style={{ display: "flex", gap: 4 }}>
          {r.selling ? <Pill cls="p-done">{t("tc.selling")}</Pill> : null}
          {r.buying ? <Pill cls="p-flat">{t("tc.buying")}</Pill> : null}
        </span>
      ),
    },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.termsAndConditions,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, page],
  });

  return (
    <ListScreen
        title={t("tc.title")}
        primary={(
          <IfCanWrite>
            <button className="btn" onClick={() => nav("/terms-and-conditions/new")}>
              {t("tc.new")}
            </button>
          </IfCanWrite>
        )}
      >
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("tc.search")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/terms-and-conditions/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("tc.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
        <ListFooter
          shown={(list.data ?? []).length}
          total={(list.data ?? []).length}
          page={page}
          pageSize={PAGE}
          onPage={setPage}
        />
      </Card>
    </ListScreen>
  );
}
