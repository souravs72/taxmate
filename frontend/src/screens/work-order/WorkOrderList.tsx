/**
 * WorkOrderList — Phase 18.
 * Callers: App.tsx /work-orders; nav under Stock
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocList, useDocCount } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = { name: string; item_name?: string; qty?: number; produced_qty?: number; planned_start_date?: string; status?: string };

function woPill(status?: string): string {
  if (!status || status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Stopped") return "p-cxl";
  if (status === "In Process") return "p-open";
  return "p-flat";
}

export default function WorkOrderList() {
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

  const list = useDocList<Row>(DT.workOrder, {
    fields: ["name", "item_name", "qty", "produced_qty", "planned_start_date", "status"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.workOrder, filters);

  const columns: Column<Row>[] = [
    { key: "name", header: t("wo.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "item", header: t("wo.col.item"), cell: (r) => r.item_name || "—" },
    { key: "qty", header: t("wo.col.qty"), cell: (r) => `${r.produced_qty ?? 0} / ${r.qty ?? 0}` },
    { key: "start", header: t("wo.col.start"), cell: (r) => date(r.planned_start_date) },
    { key: "status", header: t("wo.col.status"), cell: (r) => <Pill cls={woPill(r.status)}>{r.status || "Draft"}</Pill> },
  ];

  return (
    <>
      <PageHead title={t("wo.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/work-orders/new")}>{t("wo.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("wo.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/work-orders/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("wo.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
