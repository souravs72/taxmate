/**
 * Corporate tax filing list.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { groupRow, useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
const DEADLINES = ["Upcoming", "Due", "Overdue", "Filed"] as const;
type Deadline = (typeof DEADLINES)[number];
type Row = {
  name: string;
  period_start?: string;
  period_end?: string;
  filing_due_date?: string;
  deadline_status?: string;
  tax_payable?: number;
  taxable_profit?: number;
};
type Agg = { name?: string; count?: number; amount?: number };

function deadlinePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Filed") return "p-done";
  return "p-open";
}

export default function CtFilingList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const deadline = get("deadline") as Deadline | "";
  const company = session.company;
  const paused = !session.user || !company;
  const cur = session.currency || "";

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [["docstatus", "<", 2]];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);
  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (deadline) f.push(["deadline_status", "=", deadline]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, deadline, q]);

  const list = useDocList<Row>(DT.ctFiling, {
    fields: ["name", "period_start", "period_end", "filing_due_date", "deadline_status", "tax_payable", "taxable_profit"],
    filters, orderBy: { field: "filing_due_date", order: "asc" }, limit: PAGE, limit_start: start,
  }, paused ? null : undefined);
  const count = useDocCount(DT.ctFiling, filters, undefined, paused ? null : undefined);
  const byDeadline = useGroupedAggregate<Agg>(DT.ctFiling, {
    fields: [{ COUNT: "*", as: "count" }, { SUM: "tax_payable", as: "amount" }, "deadline_status as name"],
    filters: baseFilters, groupBy: "deadline_status", enabled: !paused,
  });

  const pick = groupRow<Agg>;
  const overdue = Number(pick(byDeadline.rows, "Overdue")?.count) || 0;
  const due = Number(pick(byDeadline.rows, "Due")?.count) || 0;
  const filed = Number(pick(byDeadline.rows, "Filed")?.count) || 0;
  const payable = byDeadline.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const donut = DEADLINES.map((d) => ({
    key: d, label: d, n: Number(pick(byDeadline.rows, d)?.count) || 0,
    colour: d === "Overdue" ? "var(--bad)" : d === "Filed" ? "var(--c-billed)" : "var(--brand)",
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("ct.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "period", header: t("v201.col.period"), cell: (r) => `${date(r.period_start)} – ${date(r.period_end)}` },
    { key: "due", header: t("v201.col.due"), className: "dt", cell: (r) => date(r.filing_due_date) },
    { key: "profit", header: t("ct.col.profit"), className: "n", cell: (r) => money(r.taxable_profit) },
    { key: "tax", header: t("ct.col.tax"), className: "n tot", cell: (r) => money(r.tax_payable) },
    { key: "deadline", header: t("v201.col.deadline"), cell: (r) => <Pill cls={deadlinePill(r.deadline_status)}>{r.deadline_status || "—"}</Pill> },
  ];

  return (
    <>
      <PageHead title={t("ct.title")} />
      {byDeadline.ready && (
        <div className="tiles">
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)" icon='<path d="M9 2.5 16 15H2z"/>' label={t("v201.tile.overdue")} value={overdue} foot={t("ct.tile.overdueFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)" icon='<path d="M3.5 3.5h11v11h-11z"/>' label={t("v201.tile.due")} value={due} foot={t("ct.tile.dueFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)" icon='<path d="M3.5 2.5h11v13h-11z"/>' label={t("ct.tile.filed")} value={filed} foot={t("ct.tile.filedFoot")} />
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)" icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>' label={t("ct.tile.tax")} value={money(payable)} unit={cur} foot={t("ct.tile.taxFoot")} />
        </div>
      )}
      <div className="charts">
        <Card title={t("ct.chart")} bodyClass="donutwrap">
          {paused || byDeadline.isLoading ? <Loading /> : (<><Donut data={donut} total={donutTotal} centreLabel={t("v201.chart.all")} /><Legend data={donut} /></>)}
        </Card>
        {byDeadline.ready && (
          <Card title={t("ct.chartTax")} bodyClass="bars">
            {DEADLINES.map((d) => {
              const n = Number(pick(byDeadline.rows, d)?.amount) || 0;
              return <BarRow key={d} label={d} currency={cur} value={payable ? (n / payable) * 100 : 0} amount={n} colour={d === "Overdue" ? "var(--bad)" : "var(--c-confirmed)"} />;
            })}
          </Card>
        )}
      </div>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ct.search")} />
          <SelectFilter value={deadline} onChange={(v) => set("deadline", v)} allLabel={t("v201.allDeadline")}
            options={DEADLINES.map((d) => ({ value: d, label: d }))} />
        </FilterBar>
        <DataTable<Row> rows={list.data ?? []} rowKey={(r) => r.name}
          onOpen={(r) => nav(`/ct-filings/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("ct.empty")} columns={columns} />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
