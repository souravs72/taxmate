/**
 * TaxCategoryList — list Tax Category masters (Phase 11).
 * Callers: App.tsx /tax-categories
 * API: taxmate.api.resource.get_list on "Tax Category" (already in _CORE_MASTERS)
 * Schema: {name, title, is_reverse_charge}
 * User instruction: Phase 11 — Tax Category list/form
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

const PAGE = 30;
type Row = { name: string; title?: string; is_reverse_charge?: number };

export default function TaxCategoryList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["title", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>("Tax Category", {
    fields: ["name", "title", "is_reverse_charge"],
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
      key: "reverse",
      header: t("txc.col.reverse"),
      cell: (r) => (r.is_reverse_charge ? t("yes") : t("no")),
    },
  ];

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
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/tax-categories/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("txc.empty")}
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
