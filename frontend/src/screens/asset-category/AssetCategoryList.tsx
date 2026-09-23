/**
 * Asset Category list screen.
 * Importers: App.tsx route /asset-categories.
 * API: taxmate.api.resource.get_list on Asset Category.
 * Schema: name (asset_category_name is the title field), enable_cwip_accounting.
 * User: "Implement the plan… complete all the to-dos."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 20;

type Row = { name: string; enable_cwip_accounting?: 0 | 1 };

export default function AssetCategoryList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const list = useDocList<Row>(DT.assetCategory, {
    fields: ["name", "enable_cwip_accounting"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.assetCategory, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("ac.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "cwip", header: t("ac.col.cwip"), cell: (r) => r.enable_cwip_accounting ? "✓" : "—" },
  ];

  return (
    <>
      <PageHead
        title={t("ac.title")}
        actions={<button className="btn" onClick={() => nav("/asset-categories/new")}>{t("ac.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ac.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/asset-categories/${encodeURIComponent(r.name)}/edit`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("ac.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
