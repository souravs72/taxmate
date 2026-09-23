/**
 * Stock Reconciliation list. Importers: App.tsx.
 * API: taxmate.api.resource.get_list on Stock Reconciliation.
 * Schema: name, purpose, posting_date, docstatus.
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;

type Row = { name: string; purpose?: string; posting_date?: string; docstatus?: number; };

function srPill(ds?: number): string {
  if (ds === 2) return "p-cxl";
  if (ds === 1) return "p-done";
  return "p-draft";
}
function srStatus(ds?: number): string {
  if (ds === 2) return t("pay.status.Cancelled");
  if (ds === 1) return t("pay.status.Submitted");
  return t("pay.status.Draft");
}

export default function StockReconciliationList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const purposeFilter = get("purpose");
  const paused = !session.user;

  const baseFilters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (purposeFilter) f.push(["purpose", "=", purposeFilter]);
    return f;
  }, [baseFilters, purposeFilter]);

  const list = useDocList<Row>(DT.stockReconciliation, {
    fields: ["name", "purpose", "posting_date", "docstatus"],
    filters: filters as never,
    orderBy: { field: "posting_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.stockReconciliation, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("sr.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "purpose", header: t("sr.col.purpose"), cell: (r) => r.purpose || "—" },
    { key: "date", header: t("sr.col.date"), cell: (r) => date(r.posting_date) },
    { key: "status", header: t("so.col.status"), cell: (r) => <Pill cls={srPill(r.docstatus)}>{srStatus(r.docstatus)}</Pill> },
  ];

  const purposes = [
    { value: "Opening Stock", label: t("sr.purpose.opening") },
    { value: "Stock Reconciliation", label: t("sr.purpose.reconcile") },
  ];

  return (
    <>
      <PageHead
        title={t("sr.title")}
        actions={
          <button className="btn" onClick={() => nav("/stock-reconciliations/new")}>
            {t("sr.new")}
          </button>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("sr.search")} />
          <SelectFilter value={purposeFilter} onChange={(v) => set("purpose", v)}
            allLabel={t("sr.purpose")} options={purposes} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/stock-reconciliations/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("sr.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
