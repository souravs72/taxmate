import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
/**
 * TaxCategoryList — list Tax Category masters (Phase 11).
 * Callers: App.tsx /tax-categories
 * API: taxmate.api.resource.get_list on "Tax Category" (already in _CORE_MASTERS)
 * Schema: {name, title, disabled}
 * User instruction: Phase 11 — Tax Category list/form
 */
import {useMemo, useCallback} from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 30;
type Row = { name: string; title?: string; disabled?: number };

export default function TaxCategoryList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["title", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>("Tax Category", {
    fields: ["name", "title", "disabled"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("txc.col.name"),
      cell: (r) => <span className="ordno">{r.title || r.name}</span>,
    },
    {
      key: "disabled",
      header: t("txc.col.disabled"),
      cell: (r) => (r.disabled ? t("no") : t("yes")),
    },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.taxCategory,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, page],
  });

  return (
    <>
      <PageHead title={t("txc.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/tax-categories/new")}>
            {t("txc.new")}
          </button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter
            value={q}
            onChange={(v) => set("q", v)}
            placeholder={t("txc.search")}
          />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/tax-categories/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("txc.empty")}
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
    </>
  );
}
