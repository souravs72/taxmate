/**
 * Late filing notice list.
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
import { BarRow, Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
const STATUSES = ["Upcoming", "Due", "Overdue", "Cleared"] as const;
const OBLIGATIONS = ["VAT 201", "Corporate Tax", "ESR Notification", "ESR Report"] as const;
type St = (typeof STATUSES)[number];
type Row = {
  name: string; obligation?: string; status?: string; due_date?: string; days_late?: number;
  source_doctype?: string; source_name?: string;
};
type Agg = { name?: string; count?: number };

function latePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Cleared") return "p-done";
  return "p-open";
}

export default function LateFilingList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const status = get("status") as St | "";
  const obligation = get("obligation");
  const company = session.company;
  const paused = !session.user || !company;
  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);
  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status) f.push(["status", "=", status]);
    if (obligation) f.push(["obligation", "=", obligation]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status, obligation, q]);

  const list = useDocList<Row>(DT.lateFiling, {
    fields: ["name", "obligation", "status", "due_date", "days_late", "source_doctype", "source_name"],
    filters, orderBy: { field: "due_date", order: "asc" }, limit: PAGE, limit_start: start,
  }, paused ? null : undefined);
  const count = useDocCount(DT.lateFiling, filters, undefined, paused ? null : undefined);
  const byStatus = useGroupedAggregate<Agg>(DT.lateFiling, {
    fields: [{ COUNT: "*", as: "count" }, "status as name"], filters: baseFilters, groupBy: "status", enabled: !paused,
  });
  const byObl = useGroupedAggregate<Agg>(DT.lateFiling, {
    fields: [{ COUNT: "*", as: "count" }, "obligation as name"], filters: baseFilters, groupBy: "obligation", enabled: !paused,
  });
  const pick = groupRow<Agg>;
  const overdue = Number(pick(byStatus.rows, "Overdue")?.count) || 0;
  const due = Number(pick(byStatus.rows, "Due")?.count) || 0;
  const cleared = Number(pick(byStatus.rows, "Cleared")?.count) || 0;
  const donut = STATUSES.map((s) => ({
    key: s, label: s, n: Number(pick(byStatus.rows, s)?.count) || 0,
    colour: s === "Overdue" ? "var(--bad)" : s === "Cleared" ? "var(--c-billed)" : "var(--brand)",
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const oblTotal = byObl.rows.reduce((a, r) => a + (Number(r.count) || 0), 0);
  const columns: Column<Row>[] = [
    { key: "name", header: t("lf.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "obl", header: t("lf.col.obligation"), cell: (r) => r.obligation || "—" },
    { key: "src", header: t("lf.col.source"), cell: (r) => r.source_name || "—" },
    { key: "due", header: t("v201.col.due"), className: "dt", cell: (r) => date(r.due_date) },
    { key: "late", header: t("lf.col.days"), className: "n", cell: (r) => r.days_late ?? 0 },
    { key: "status", header: t("so.col.status"), cell: (r) => <Pill cls={latePill(r.status)}>{r.status || "—"}</Pill> },
  ];
  return (
    <>
      <PageHead title={t("lf.title")} />
      {byStatus.ready && (
        <div className="tiles">
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)" icon='<path d="M9 2.5 16 15H2z"/>' label={t("v201.tile.overdue")} value={overdue} foot={t("lf.tile.overdueFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)" icon='<path d="M3.5 3.5h11v11h-11z"/>' label={t("v201.tile.due")} value={due} foot={t("lf.tile.dueFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)" icon='<path d="M6.8 9 8.5 10.7 11.7 7.2"/>' label={t("lf.tile.cleared")} value={cleared} foot={t("lf.tile.clearedFoot")} />
        </div>
      )}
      <div className="charts">
        <Card title={t("lf.chart")} bodyClass="donutwrap">
          {paused || byStatus.isLoading ? <Loading /> : (<><Donut data={donut} total={donutTotal} centreLabel={t("lf.chartAll")} /><Legend data={donut} /></>)}
        </Card>
        {byObl.ready && (
          <Card title={t("lf.chartObl")} bodyClass="bars">
            {byObl.rows.map((r) => (
              <BarRow key={String(r.name)} label={String(r.name || "—")}
                value={oblTotal ? (Number(r.count) / oblTotal) * 100 : 0}
                amount={Number(r.count) || 0} colour="var(--c-confirmed)" />
            ))}
          </Card>
        )}
      </div>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("lf.search")} />
          <SelectFilter value={status} onChange={(v) => set("status", v)} allLabel={t("v201.allStatus")}
            options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <SelectFilter value={obligation} onChange={(v) => set("obligation", v)} allLabel={t("lf.allObl")}
            options={OBLIGATIONS.map((s) => ({ value: s, label: s }))} />
        </FilterBar>
        <DataTable<Row> rows={list.data ?? []} rowKey={(r) => r.name}
          onOpen={(r) => nav(`/late-filings/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("lf.empty")} columns={columns} />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
