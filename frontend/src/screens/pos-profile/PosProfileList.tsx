/**
 * POS Profile list screen.
 * Importers: App.tsx route /pos-profiles.
 * API: taxmate.api.resource.get_list on POS Profile.
 * Schema: name, company, warehouse, disabled (Check).
 * User: "Implement the plan… complete all the to-dos."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 20;

type Row = { name: string; company?: string; warehouse?: string; disabled?: 0 | 1 };

export default function PosProfileList() {
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

  const list = useDocList<Row>(DT.posProfile, {
    fields: ["name", "company", "warehouse", "disabled"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.posProfile, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("posp.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "company", header: t("posp.col.company"), cell: (r) => r.company || "—" },
    { key: "warehouse", header: t("posp.col.warehouse"), cell: (r) => r.warehouse || "—" },
    {
      key: "disabled",
      header: t("posp.col.status"),
      cell: (r) => <Pill cls={r.disabled ? "p-cxl" : "p-done"}>{r.disabled ? t("common.disabled") : t("common.active")}</Pill>,
    },
  ];

  return (
    <>
      <PageHead title={t("posp.title")} />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("posp.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/pos-profiles/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("posp.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
