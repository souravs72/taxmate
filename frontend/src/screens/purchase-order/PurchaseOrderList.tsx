import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { date, money, pct } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, MiniBar, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
const PO_STATUSES = [
  "Draft",
  "On Hold",
  "To Receive and Bill",
  "To Bill",
  "To Receive",
  "Completed",
  "Cancelled",
  "Closed",
  "Delivered",
] as const;
type PoStatus = (typeof PO_STATUSES)[number];
type PoStage = "draft" | "open" | "done" | "closed";
const OPEN: PoStatus[] = ["To Receive and Bill", "To Bill", "To Receive"];

const STAGE_COLOUR: Record<PoStage, string> = {
  draft: "var(--c-draft)",
  open: "var(--c-confirmed)",
  done: "var(--c-billed)",
  closed: "var(--c-delivered)",
};

type Row = {
  name: string;
  supplier?: string;
  supplier_name?: string;
  transaction_date?: string;
  schedule_date?: string;
  grand_total?: number;
  currency?: string;
  status?: string;
  per_received?: number;
  per_billed?: number;
};

type Agg = { name?: string; count?: number; billed?: number };

function poStage(status?: string): PoStage {
  if (status === "Draft" || status === "On Hold") return "draft";
  if (status === "Completed" || status === "Delivered") return "done";
  if (status === "Cancelled" || status === "Closed") return "closed";
  return "open";
}

function poPill(status?: string): string {
  if (status === "Draft" || status === "On Hold") return "p-draft";
  if (status === "Completed" || status === "Delivered") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  return "p-open";
}

export default function PurchaseOrderList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const supplier = get("supplier");
  const status = get("status") as PoStatus | "";
  const company = session.company;
  const paused = !session.user || !company;

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    if (supplier) f.push(["supplier", "=", supplier]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [company, supplier, q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status) f.push(["status", "=", status]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status]);

  const lateFilters = useMemo(() => {
    const f = [...baseFilters, ["status", "in", OPEN]] as FilterTuple[];
    if (session.today) f.push(["schedule_date", "<", session.today]);
    return f;
  }, [baseFilters, session.today]);

  const list = useDocList<Row>(
    DT.purchaseOrder,
    {
      fields: [
        "name", "supplier", "supplier_name", "transaction_date", "schedule_date",
        "grand_total", "currency", "status", "per_received", "per_billed",
      ],
      filters,
      orderBy: { field: "modified", order: "desc" },
      limit: PAGE,
      limit_start: start,
    },
    paused ? null : undefined,
  );
  const count = useDocCount(DT.purchaseOrder, filters, undefined, paused ? null : undefined);
  const late = useDocCount(DT.purchaseOrder, lateFilters, undefined, paused || !session.today ? null : undefined);
  const agg = useGroupedAggregate<Agg>(DT.purchaseOrder, {
    fields: [
      { COUNT: "*", as: "count" },
      { SUM: "base_grand_total", as: "billed" },
      "status as name",
    ],
    filters: baseFilters,
    groupBy: "status",
    enabled: !paused,
  });
  const rows = list.data ?? [];

  const totals = useMemo(() => {
    const stages: Record<PoStage, number> = { draft: 0, open: 0, done: 0, closed: 0 };
    let openValue = 0;
    let doneValue = 0;
    for (const row of agg.rows) {
      const stage = poStage(row.name);
      stages[stage] += Number(row.count) || 0;
      if (stage === "open") openValue += Number(row.billed) || 0;
      if (stage === "done") doneValue += Number(row.billed) || 0;
    }
    return { stages, openValue, doneValue, booked: openValue + doneValue };
  }, [agg.rows]);

  const donut = [
    { key: "draft", label: t("stage.draft"), n: totals.stages.draft, colour: STAGE_COLOUR.draft },
    { key: "open", label: t("po.stage.open"), n: totals.stages.open, colour: STAGE_COLOUR.open },
    { key: "done", label: t("status.Completed"), n: totals.stages.done, colour: STAGE_COLOUR.done },
    { key: "closed", label: t("inv.stage.closed"), n: totals.stages.closed, colour: STAGE_COLOUR.closed },
  ];
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("po.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "supplier", header: t("nav.suppliers"), className: "cust", cell: (r) => r.supplier_name || r.supplier || "—" },
    { key: "date", header: t("so.col.orderDate"), className: "dt", cell: (r) => date(r.transaction_date) },
    { key: "required", header: t("po.required"), className: "dt", cell: (r) => date(r.schedule_date) },
    {
      key: "total", header: t("so.col.total"), className: "n tot",
      cell: (r) => (
        <>
          {r.currency && r.currency !== cur && <span className="cur">{r.currency}</span>}
          {money(r.grand_total)}
        </>
      ),
    },
    {
      key: "fulfilment",
      header: (
        <>
          {t("so.col.fulfilment")}
          <span className="thlegend">
            <span><i style={{ background: "var(--c-delivered)" }} />{t("po.bar.received")}</span>
            <span><i style={{ background: "var(--c-billed)" }} />{t("so.bar.billed")}</span>
          </span>
        </>
      ),
      cell: (r) => (
        <div className="ful">
          <div className="fl">
            <MiniBar value={r.per_received ?? 0} colour="var(--c-delivered)" />
            <span className="fpc">{pct(r.per_received)}</span>
          </div>
          <div className="fl">
            <MiniBar value={r.per_billed ?? 0} colour="var(--c-billed)" />
            <span className="fpc">{pct(r.per_billed)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={poPill(r.status)}>{r.status || "—"}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        title={t("po.title")}
        sub={t("po.sub")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/purchase-orders/new")}>
              ＋ {t("po.new")}
            </button>
          ) : null
        }
      />

      {agg.ready && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6"/>'
            label={t("po.tile.open")} value={totals.stages.open}
            foot={`${cur ? `${cur} ` : ""}${money(totals.openValue)} ${t("po.tile.openFoot")}`} />
          <StatTile colour="var(--c-delivered)" tint="rgba(8,145,178,.13)"
            icon='<path d="M2 6h8v6H2zM10 8h2.5L15.5 10.5v1.5H10z"/>'
            label={t("po.tile.committed")} value={money(totals.openValue)} unit={cur}
            foot={t("po.tile.committedFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'
            label={t("po.tile.completed")} value={money(totals.doneValue)} unit={cur}
            foot={t("po.tile.completedFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("po.tile.late")} value={late.data ?? 0}
            foot={t("po.tile.lateFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("po.chart.stage")} hint={t("po.chart.stageHint")} bodyClass="donutwrap">
          {paused || agg.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("po.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {agg.ready && (
          <Card title={t("po.chart.value")} hint={t("po.chart.valueHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(totals.booked)}</span>
            </div>
            <BarRow label={t("po.bar.open")} currency={cur}
              value={totals.booked ? (totals.openValue / totals.booked) * 100 : 0}
              amount={totals.openValue} colour="var(--c-confirmed)" />
            <BarRow label={t("po.bar.completed")} currency={cur}
              value={totals.booked ? (totals.doneValue / totals.booked) * 100 : 0}
              amount={totals.doneValue} colour="var(--c-billed)" />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("po.search")} />
          <LinkFilter
            doctype={DT.supplier}
            value={supplier}
            onChange={(v) => set("supplier", v)}
            placeholder={t("filter.allSuppliers")}
            clearLabel={t("filter.clearSupplier")}
          />
          <SelectFilter
            value={status}
            onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={PO_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/purchase-orders/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("po.empty")}
          columns={columns}
        />
        <ListFooter shown={rows.length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
