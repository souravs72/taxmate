import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
/**
 * AddressList — Phase 12. Standalone address directory.
 * Callers: App.tsx /addresses
 * API: taxmate.api.resource.get_list on "Address" (_CORE_MASTERS)
 * Schema: {name, address_title, address_type, city, country, emirate}
 * Instruction: Phase 12 — Standalone Address list/form/detail
 */
import {useMemo, useCallback} from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card } from "../../components/ui";
import { ListScreen } from "../../components/screen";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = {
  name: string;
  address_title?: string;
  address_type?: string;
  city?: string;
  country?: string;
};

export default function AddressList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["address_title", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>("Address", {
    fields: ["name", "address_title", "address_type", "city", "country"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: t("addr.col.title"),
      cell: (r) => <span className="ordno">{r.address_title || r.name}</span>,
    },
    { key: "type", header: t("addr.col.type"), cell: (r) => r.address_type || "—" },
    {
      key: "city",
      header: t("addr.col.city"),
      cell: (r) => [r.city, r.country].filter(Boolean).join(", ") || "—",
    },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.address,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, page],
  });

  return (
    <ListScreen
        title={t("addr.title")}
        primary={(
          <IfCanWrite>
            <button className="btn" onClick={() => nav("/addresses/new")}>
              {t("addr.new")}
            </button>
          </IfCanWrite>
        )}
      >
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("addr.search")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/addresses/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("addr.empty")}
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
