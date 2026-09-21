import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { groupRow, useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;

type Row = {
  name: string;
  warehouse_name?: string;
  warehouse_type?: string;
  is_group?: number;
  disabled?: number;
  parent_warehouse?: string;
};

type Agg = { name?: string; count?: number };

export default function WarehouseList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const kind = get("kind");
  const company = session.company;
  const paused = !session.user || !company;

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [company, q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (kind === "group") f.push(["is_group", "=", 1]);
    else if (kind === "leaf") f.push(["is_group", "=", 0]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, kind]);

  const list = useDocList<Row>(DT.warehouse, {
    fields: ["name", "warehouse_name", "warehouse_type", "is_group", "disabled", "parent_warehouse"],
    filters,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);
  const count = useDocCount(DT.warehouse, filters, undefined, paused ? null : undefined);
  const byKind = useGroupedAggregate<Agg>(DT.warehouse, {
    fields: [{ COUNT: "*", as: "count" }, "is_group as name"],
    filters: baseFilters,
    groupBy: "is_group",
    enabled: !paused,
  });
  const byType = useGroupedAggregate<Agg>(DT.warehouse, {
    fields: [{ COUNT: "*", as: "count" }, "warehouse_type as name"],
    filters: [...baseFilters, ["is_group", "=", 0]],
    groupBy: "warehouse_type",
    enabled: !paused,
  });

  const pick = groupRow<Agg>;
  const groups = Number(pick(byKind.rows, "1")?.count) || 0;
  const leaves = Number(pick(byKind.rows, "0")?.count) || 0;
  const donut = [
    { key: "0", label: t("wh.leaf"), n: leaves, colour: "var(--c-billed)" },
    { key: "1", label: t("wh.group"), n: groups, colour: "var(--c-confirmed)" },
  ];
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const typeTotal = byType.rows.reduce((a, r) => a + (Number(r.count) || 0), 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("wh.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "type", header: t("wh.col.type"), cell: (r) => r.warehouse_type || "—" },
    { key: "parent", header: t("wh.col.parent"), cell: (r) => r.parent_warehouse || "—" },
    {
      key: "kind", header: t("wh.col.kind"),
      cell: (r) => <Pill cls={r.is_group ? "p-flat" : "p-done"}>{r.is_group ? t("wh.group") : t("wh.leaf")}</Pill>,
    },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => r.disabled ? <Pill cls="p-cxl">{t("coa.disabled")}</Pill> : <Pill cls="p-done">{t("wh.active")}</Pill>,
    },
  ];

  return (
    <>
      <PageHead title={t("wh.title")} />
      {byKind.ready && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3 14.5V6l6-3.5 6 3.5v8.5"/>'
            label={t("wh.tile.leaves")} value={leaves} foot={t("wh.tile.leavesFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h11v13h-11z"/>'
            label={t("wh.tile.groups")} value={groups} foot={t("wh.tile.groupsFoot")} />
        </div>
      )}
      <div className="charts">
        <Card title={t("wh.chart.kind")} hint={t("wh.chart.kindHint")} bodyClass="donutwrap">
          {paused || byKind.isLoading ? <Loading /> : (
            <><Donut data={donut} total={donutTotal} centreLabel={t("wh.chart.all")} /><Legend data={donut} /></>
          )}
        </Card>
        {byType.ready && (
          <Card title={t("wh.chart.type")} hint={t("wh.chart.typeHint")} bodyClass="bars">
            {byType.rows.slice(0, 6).map((r) => (
              <BarRow key={String(r.name)} label={String(r.name || t("wh.untyped"))}
                value={typeTotal ? (Number(r.count) / typeTotal) * 100 : 0}
                amount={Number(r.count) || 0} colour="var(--c-confirmed)" />
            ))}
          </Card>
        )}
      </div>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("wh.search")} />
          <SelectFilter value={kind} onChange={(v) => set("kind", v)} allLabel={t("wh.allKinds")}
            options={[{ value: "leaf", label: t("wh.leaf") }, { value: "group", label: t("wh.group") }]} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/warehouses/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("wh.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
