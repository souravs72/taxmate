/**
 * BomList — Phase 18. Bill of Materials list.
 * Callers: App.tsx /boms; nav under Stock
 * API: taxmate.api.resource.get_list on "BOM"
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocList, useDocCount } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = { name: string; item?: string; item_name?: string; quantity?: number; is_active?: number; is_default?: number };

export default function BomList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const company = session.company;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (company) f.push(["company", "=", company]);
    if (q.trim()) f.push(["item_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [company, q]);

  const list = useDocList<Row>(DT.bom, {
    fields: ["name", "item", "item_name", "quantity", "is_active", "is_default"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.bom, filters);

  const columns: Column<Row>[] = [
    { key: "name", header: t("bom.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "item", header: t("bom.col.item"), cell: (r) => r.item_name || r.item || "—" },
    { key: "qty", header: t("bom.col.qty"), cell: (r) => r.quantity ?? "—" },
    {
      key: "active", header: t("bom.col.active"),
      cell: (r) => r.is_active ? <Pill cls="p-done">{t("yes")}</Pill> : <Pill cls="p-flat">{t("no")}</Pill>,
    },
  ];

  return (
    <>
      <PageHead title={t("bom.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/boms/new")}>{t("bom.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("bom.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/boms/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("bom.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
