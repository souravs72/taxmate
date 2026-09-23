/**
 * ContactList — Phase 12.
 * Callers: App.tsx /contacts; nav.ts nav.contacts
 * API: taxmate.api.resource.get_list on "Contact" (_CORE_MASTERS)
 * Schema: {name, first_name, last_name, email_id, phone}
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = { name: string; first_name?: string; last_name?: string; email_id?: string; phone?: string };

export default function ContactList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["first_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>("Contact", {
    fields: ["name", "first_name", "last_name", "email_id", "phone"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("cnt.col.name"),
      cell: (r) => (
        <span className="ordno">
          {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.name}
        </span>
      ),
    },
    { key: "email", header: t("cnt.col.email"), cell: (r) => r.email_id || "—" },
    { key: "phone", header: t("cnt.col.phone"), cell: (r) => r.phone || "—" },
  ];

  return (
    <>
      <PageHead title={t("cnt.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/contacts/new")}>
            {t("cnt.new")}
          </button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("cnt.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/contacts/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("cnt.empty")}
          columns={columns}
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
