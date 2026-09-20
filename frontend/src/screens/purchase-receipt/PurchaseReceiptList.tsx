import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { date, money, pct } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, MiniBar, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
const PR_STATUSES = [
  "Draft",
  "Partly Billed",
  "To Bill",
  "Completed",
  "Return",
  "Return Issued",
  "Cancelled",
  "Closed",
] as const;
type PrStatus = (typeof PR_STATUSES)[number];
type PrStage = "draft" | "open" | "done" | "closed";

const STAGE_COLOUR: Record<PrStage, string> = {
  draft: "var(--c-draft)",
  open: "var(--c-confirmed)",
  done: "var(--c-billed)",
  closed: "var(--c-delivered)",
};

type Row = {
  name: string;
  supplier?: string;
  supplier_name?: string;
  posting_date?: string;
  grand_total?: number;
  currency?: string;
  status?: string;
  per_billed?: number;
};

type Agg = { name?: string; count?: number; billed?: number };

function prStage(status?: string): PrStage {
  if (status === "Draft") return "draft";
  if (status === "Completed") return "done";
  if (status === "Cancelled" || status === "Closed" || status === "Return" || status === "Return Issued") return "closed";
  return "open";
}

function prPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  if (status === "Return" || status === "Return Issued") return "p-warn";
  return "p-open";
}

export default function PurchaseReceiptList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const supplier = get("supplier");
  const status = get("status") as PrStatus | "";
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

  const list = useDocList<Row>(
    DT.purchaseReceipt,
    {
      fields: [
        "name", "supplier", "supplier_name", "posting_date",
        "grand_total", "currency", "status", "per_billed",
      ],
      filters,
      orderBy: { field: "modified", order: "desc" },
      limit: PAGE,
      limit_start: start,
    },
    paused ? null : undefined,
  );
  const count = useDocCount(DT.purchaseReceipt, filters, undefined, paused ? null : undefined);
  const agg = useGroupedAggregate<Agg>(DT.purchaseReceipt, {
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
    const stages: Record<PrStage, number> = { draft: 0, open: 0, done: 0, closed: 0 };
    let openValue = 0;
    let doneValue = 0;
    for (const row of agg.rows) {
      const stage = prStage(row.name);
      stages[stage] += Number(row.count) || 0;
      if (stage === "open") openValue += Number(row.billed) || 0;
      if (stage === "done") doneValue += Number(row.billed) || 0;
    }
    return { stages, openValue, doneValue, booked: openValue + doneValue };
  }, [agg.rows]);

  const donut = [
    { key: "draft", label: t("stage.draft"), n: totals.stages.draft, colour: STAGE_COLOUR.draft },
    { key: "open", label: t("pr.stage.open"), n: totals.stages.open, colour: STAGE_COLOUR.open },
    { key: "done", label: t("status.Completed"), n: totals.stages.done, colour: STAGE_COLOUR.done },
    { key: "closed", label: t("inv.stage.closed"), n: totals.stages.closed, colour: STAGE_COLOUR.closed },
  ];
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("pr.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "supplier", header: t("nav.suppliers"), className: "cust", cell: (r) => r.supplier_name || r.supplier || "—" },
    { key: "date", header: t("inv.col.date"), className: "dt", cell: (r) => date(r.posting_date) },
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
      key: "billed",
      header: t("so.bar.billed"),
      cell: (r) => (
        <div className="ful">
          <div className="fl">
            <MiniBar value={r.per_billed ?? 0} colour="var(--c-billed)" />
            <span className="fpc">{pct(r.per_billed)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={prPill(r.status)}>{r.status || "—"}</Pill>,
    },
  ];

  return (
    <>
      <PageHead title={t("pr.title")} sub={t("pr.sub")} />

      {agg.ready && (
        <div className="tiles">
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6"/>'
            label={t("pr.tile.drafts")} value={totals.stages.draft}
            foot={t("pr.tile.draftsFoot")} />
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/>'
            label={t("pr.tile.toBill")} value={totals.stages.open}
            foot={`${cur ? `${cur} ` : ""}${money(totals.openValue)} ${t("pr.tile.toBillFoot")}`} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'
            label={t("pr.tile.completed")} value={money(totals.doneValue)} unit={cur}
            foot={t("pr.tile.completedFoot")} />
          <StatTile colour="var(--c-delivered)" tint="rgba(8,145,178,.13)"
            icon='<path d="M2 6h8v6H2zM10 8h2.5L15.5 10.5v1.5H10z"/>'
            label={t("pr.tile.receipts")} value={donutTotal}
            foot={t("pr.tile.receiptsFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("pr.chart.status")} hint={t("pr.chart.statusHint")} bodyClass="donutwrap">
          {paused || agg.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("pr.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {agg.ready && (
          <Card title={t("pr.chart.value")} hint={t("pr.chart.valueHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(totals.booked)}</span>
            </div>
            <BarRow label={t("pr.bar.toBill")} currency={cur}
              value={totals.booked ? (totals.openValue / totals.booked) * 100 : 0}
              amount={totals.openValue} colour="var(--c-confirmed)" />
            <BarRow label={t("pr.bar.completed")} currency={cur}
              value={totals.booked ? (totals.doneValue / totals.booked) * 100 : 0}
              amount={totals.doneValue} colour="var(--c-billed)" />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("pr.search")} />
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
            options={PR_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/purchase-receipts/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("pr.empty")}
          columns={columns}
        />
        <ListFooter shown={rows.length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
