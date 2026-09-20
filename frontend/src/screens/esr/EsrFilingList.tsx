/**
 * Importers: App.tsx /esr. Callers: rail, search.
 * API: catalog get_list/get_count/group_by on UAE ESR Filing.
 * Schema: status, financial_year_start/end, notification_due_date, report_due_date, has_relevant_activity.
 * User: "Task 15: CT filing, ESR, UBO, late filing — one DocType list at a time"
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { groupRow, useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
const STATUSES = ["Not Started", "Notification Due", "Notification Filed", "Report Due", "Complete", "Overdue"] as const;
type St = (typeof STATUSES)[number];
type Row = {
  name: string; financial_year_start?: string; financial_year_end?: string; status?: string;
  licence_authority?: string; notification_due_date?: string; report_due_date?: string; has_relevant_activity?: number;
};
type Agg = { name?: string; count?: number };

function esrPill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Complete") return "p-done";
  if (status === "Report Due" || status === "Notification Due") return "p-warn";
  return "p-open";
}

export default function EsrFilingList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const status = get("status") as St | "";
  const company = session.company;
  const paused = !session.user || !company;
  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [["docstatus", "<", 2]];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);
  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status) f.push(["status", "=", status]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status, q]);

  const list = useDocList<Row>(DT.esrFiling, {
    fields: ["name", "financial_year_start", "financial_year_end", "status", "licence_authority", "notification_due_date", "report_due_date", "has_relevant_activity"],
    filters, orderBy: { field: "financial_year_end", order: "desc" }, limit: PAGE, limit_start: start,
  }, paused ? null : undefined);
  const count = useDocCount(DT.esrFiling, filters, undefined, paused ? null : undefined);
  const byStatus = useGroupedAggregate<Agg>(DT.esrFiling, {
    fields: [{ COUNT: "*", as: "count" }, "status as name"], filters: baseFilters, groupBy: "status", enabled: !paused,
  });
  const pick = groupRow<Agg>;
  const overdue = Number(pick(byStatus.rows, "Overdue")?.count) || 0;
  const complete = Number(pick(byStatus.rows, "Complete")?.count) || 0;
  const donut = STATUSES.map((s) => ({
    key: s, label: s, n: Number(pick(byStatus.rows, s)?.count) || 0,
    colour: s === "Overdue" ? "var(--bad)" : s === "Complete" ? "var(--c-billed)" : "var(--brand)",
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const columns: Column<Row>[] = [
    { key: "name", header: t("esr.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "year", header: t("esr.col.year"), cell: (r) => `${date(r.financial_year_start)} – ${date(r.financial_year_end)}` },
    { key: "auth", header: t("esr.col.auth"), cell: (r) => r.licence_authority || "—" },
    { key: "ndue", header: t("esr.col.notify"), className: "dt", cell: (r) => date(r.notification_due_date) },
    { key: "rdue", header: t("esr.col.report"), className: "dt", cell: (r) => date(r.report_due_date) },
    { key: "status", header: t("so.col.status"), cell: (r) => <Pill cls={esrPill(r.status)}>{r.status || "—"}</Pill> },
  ];
  return (
    <>
      <PageHead title={t("esr.title")} sub={t("esr.sub")} />
      {byStatus.ready && (
        <div className="tiles">
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)" icon='<path d="M9 2.5 16 15H2z"/>' label={t("v201.tile.overdue")} value={overdue} foot={t("esr.tile.overdueFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)" icon='<path d="M3.5 2.5h11v13h-11z"/>' label={t("esr.tile.complete")} value={complete} foot={t("esr.tile.completeFoot")} />
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)" icon='<path d="M3 15.5V8l6-4 6 4v7.5"/>' label={t("esr.tile.all")} value={donutTotal} foot={t("esr.tile.allFoot")} />
        </div>
      )}
      <Card title={t("esr.chart")} hint={t("esr.chartHint")} bodyClass="donutwrap">
        {paused || byStatus.isLoading ? <Loading /> : (<><Donut data={donut} total={donutTotal} centreLabel={t("esr.chartAll")} /><Legend data={donut} /></>)}
      </Card>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("esr.search")} />
          <SelectFilter value={status} onChange={(v) => set("status", v)} allLabel={t("v201.allStatus")}
            options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </FilterBar>
        <DataTable<Row> rows={list.data ?? []} rowKey={(r) => r.name}
          onOpen={(r) => nav(`/esr/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("esr.empty")} columns={columns} />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
