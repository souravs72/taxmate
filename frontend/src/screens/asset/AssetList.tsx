/**
 * Asset list screen.
 * Importers: App.tsx route /assets.
 * API: taxmate.api.resource.get_list on Asset.
 * Schema: name, asset_name, asset_category, company, purchase_date, purchase_amount, docstatus.
 * User: "Implement the plan… complete all the to-dos."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 20;

type Row = {
  name: string;
  asset_name?: string;
  asset_category?: string;
  purchase_date?: string;
  purchase_amount?: number;
  docstatus?: number;
};

export default function AssetList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["asset_name", "like", `%${q.trim()}%`]);
    if (session.company) f.push(["company", "=", session.company]);
    return f;
  }, [q, session.company]);

  const list = useDocList<Row>(DT.asset, {
    fields: ["name", "asset_name", "asset_category", "purchase_date", "purchase_amount", "docstatus"],
    filters: filters as never,
    orderBy: { field: "purchase_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.asset, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("ast.col.name"), cell: (r) => <span className="ordno">{r.asset_name || r.name}</span> },
    { key: "category", header: t("ast.col.category"), cell: (r) => r.asset_category || "—" },
    { key: "date", header: t("ast.col.purchaseDate"), cell: (r) => date(r.purchase_date) },
    { key: "amount", header: t("ast.col.purchaseAmount"), cell: (r) => money(r.purchase_amount) },
    { key: "status", header: t("ast.col.status"), cell: (r) => <Pill cls={r.docstatus === 1 ? "p-done" : r.docstatus === 2 ? "p-cxl" : "p-draft"}>{r.docstatus === 1 ? t("ast.statusActive") : r.docstatus === 2 ? t("inv.status.Cancelled") : t("inv.status.Draft")}</Pill> },
  ];

  return (
    <>
      <PageHead
        title={t("ast.title")}
        actions={<button className="btn" onClick={() => nav("/assets/new")}>{t("ast.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ast.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/assets/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("ast.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
