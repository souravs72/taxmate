/**
 * TermsAndConditionsList — Phase 15.
 * Callers: App.tsx /terms-and-conditions; nav.ts nav.termsAndConditions
 * API: taxmate.api.resource.get_list on "Terms and Conditions" (_CORE_MASTERS)
 * Schema: {name, title, buying:0|1, selling:0|1}
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = { name: string; title?: string; buying?: number; selling?: number };

export default function TermsAndConditionsList() {
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

  return (
    <>
      <PageHead title={t("tc.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/terms-and-conditions/new")}>
            {t("tc.new")}
          </button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("tc.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/terms-and-conditions/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("tc.empty")}
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
