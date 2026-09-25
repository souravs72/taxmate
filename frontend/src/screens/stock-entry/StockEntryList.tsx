/**
 * Stock Entry list screen. Shows Material Receipt, Issue, Transfer entries.
 * Importers: App.tsx. API: taxmate.api.resource.get_list on Stock Entry.
 * Schema: Stock Entry fields name, stock_entry_type, posting_date, company, docstatus.
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

type Row = {
  name: string;
  stock_entry_type?: string;
  posting_date?: string;
  company?: string;
  docstatus?: number;
};

function sePill(ds?: number): string {
  if (ds === 2) return "p-cxl";
  if (ds === 1) return "p-done";
  return "p-draft";
}
function seStatus(ds?: number): string {
  if (ds === 2) return t("pay.status.Cancelled");
  if (ds === 1) return t("pay.status.Submitted");
  return t("pay.status.Draft");
}

export default function StockEntryList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const kind = get("kind");
  const paused = !session.user;

  const baseFilters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (kind) f.push(["stock_entry_type", "=", kind]);
    return f;
  }, [baseFilters, kind]);

  const list = useDocList<Row>(DT.stockEntry, {
    fields: ["name", "stock_entry_type", "posting_date", "company", "docstatus"],
    filters: filters as never,
    orderBy: { field: "posting_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.stockEntry, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("se.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "type", header: t("se.col.type"), cell: (r) => r.stock_entry_type || "—" },
    { key: "date", header: t("se.col.date"), cell: (r) => date(r.posting_date) },
    { key: "status", header: t("so.col.status"), cell: (r) => <Pill cls={sePill(r.docstatus)}>{seStatus(r.docstatus)}</Pill> },
  ];

  const purposes = [
    { value: "Material Receipt", label: t("se.type.receipt") },
    { value: "Material Issue", label: t("se.type.issue") },
    { value: "Material Transfer", label: t("se.type.transfer") },
  ];

  return (
    <>
      <PageHead
        title={t("se.title")}
        actions={
          <button className="btn" onClick={() => nav("/stock-entries/new")}>
            {t("se.new")}
          </button>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("se.search")} />
          <SelectFilter value={kind} onChange={(v) => set("kind", v)}
            allLabel={t("se.purpose")}
            options={purposes} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/stock-entries/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("se.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
