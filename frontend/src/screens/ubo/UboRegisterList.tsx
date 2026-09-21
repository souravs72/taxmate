/**
 * Importers: App.tsx /ubo. Callers: rail, search.
 * API: catalog get_list/get_count/group_by on UAE UBO Register.
 * Schema: status Compliant|Update Reporting Due|Overdue; licence_authority; last_reviewed_on; name=company.
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
const STATUSES = ["Compliant", "Update Reporting Due", "Overdue"] as const;
type St = (typeof STATUSES)[number];
type Row = { name: string; company?: string; status?: string; licence_authority?: string; last_reviewed_on?: string };
type Agg = { name?: string; count?: number };

function uboPill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Update Reporting Due") return "p-warn";
  return "p-done";
}

export default function UboRegisterList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const status = get("status") as St | "";
  const company = session.company;
  const paused = !session.user;
  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);
  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status) f.push(["status", "=", status]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status, q]);

  const list = useDocList<Row>(DT.uboRegister, {
    fields: ["name", "company", "status", "licence_authority", "last_reviewed_on"],
    filters, orderBy: { field: "modified", order: "desc" }, limit: PAGE, limit_start: start,
  }, paused ? null : undefined);
  const count = useDocCount(DT.uboRegister, filters, undefined, paused ? null : undefined);
  const byStatus = useGroupedAggregate<Agg>(DT.uboRegister, {
    fields: [{ COUNT: "*", as: "count" }, "status as name"], filters: baseFilters, groupBy: "status", enabled: !paused,
  });
  const pick = groupRow<Agg>;
  const overdue = Number(pick(byStatus.rows, "Overdue")?.count) || 0;
  const due = Number(pick(byStatus.rows, "Update Reporting Due")?.count) || 0;
  const ok = Number(pick(byStatus.rows, "Compliant")?.count) || 0;
  const donut = STATUSES.map((s) => ({
    key: s, label: s, n: Number(pick(byStatus.rows, s)?.count) || 0,
    colour: s === "Overdue" ? "var(--bad)" : s === "Compliant" ? "var(--c-billed)" : "var(--warn)",
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const columns: Column<Row>[] = [
    { key: "name", header: t("ubo.col.name"), cell: (r) => <span className="ordno">{r.company || r.name}</span> },
    { key: "auth", header: t("esr.col.auth"), cell: (r) => r.licence_authority || "—" },
    { key: "reviewed", header: t("ubo.col.reviewed"), className: "dt", cell: (r) => date(r.last_reviewed_on) },
    { key: "status", header: t("so.col.status"), cell: (r) => <Pill cls={uboPill(r.status)}>{r.status || "—"}</Pill> },
  ];
  return (
    <>
      <PageHead title={t("ubo.title")} />
      {byStatus.ready && (
        <div className="tiles">
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)" icon='<path d="M6.8 9 8.5 10.7 11.7 7.2"/>' label={t("ubo.tile.ok")} value={ok} foot={t("ubo.tile.okFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)" icon='<path d="M3.5 3.5h11v11h-11z"/>' label={t("ubo.tile.due")} value={due} foot={t("ubo.tile.dueFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)" icon='<path d="M9 2.5 16 15H2z"/>' label={t("v201.tile.overdue")} value={overdue} foot={t("ubo.tile.overdueFoot")} />
        </div>
      )}
      <Card title={t("ubo.chart")} hint={t("ubo.chartHint")} bodyClass="donutwrap">
        {paused || byStatus.isLoading ? <Loading /> : (<><Donut data={donut} total={donutTotal} centreLabel={t("ubo.chartAll")} /><Legend data={donut} /></>)}
      </Card>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ubo.search")} />
          <SelectFilter value={status} onChange={(v) => set("status", v)} allLabel={t("v201.allStatus")}
            options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </FilterBar>
        <DataTable<Row> rows={list.data ?? []} rowKey={(r) => r.name}
          onOpen={(r) => nav(`/ubo/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("ubo.empty")} columns={columns} />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
