import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappeGetCall, useFrappeGetDocList } from "frappe-react-sdk";

import type { SalesOrder } from "../../types/erpnext";
import { METHOD, DT } from "../../lib/frappe";
import { useFilteredCount, useListParams, type FilterTuple } from "../../lib/list";
import { date, money, pct } from "../../lib/format";
import {
  SO_PILL_CLASS, STAGE_COLOUR, erpStatusesFor, isLate, toUiStatus,
  type SoUiStatus, type Stage,
} from "../../lib/status";
import { t } from "../../i18n/strings";
import {
  BarRow, Card, Donut, Legend, Loading, MiniBar, PageHead, Pill, StatTile,
} from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;

/** Only what the list needs — a Sales Order carries 170 fields. */
const FIELDS = [
  "name", "customer", "customer_name", "transaction_date", "delivery_date",
  "grand_total", "currency", "status", "docstatus", "per_delivered", "per_billed",
] as const;

type Row = Pick<SalesOrder, (typeof FIELDS)[number]>;

type GroupCount = { name: string; count: number };

export default function SalesOrderList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);

  const q = get("q");
  const customer = get("customer");
  const uiStatus = get("status") as SoUiStatus | "";

  /* Server-side filters. Status filters expand to the ERPNext values —
     see lib/status.ts for why the mapping is client-side.               */
  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (customer) f.push(["customer", "=", customer]);
    if (uiStatus) f.push(["status", "in", erpStatusesFor(uiStatus)]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [customer, uiStatus, q]);

  const list = useFrappeGetDocList<Row>(DT.salesOrder, {
    fields: [...FIELDS],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const { total } = useFilteredCount(DT.salesOrder, filters as unknown as FilterTuple[]);

  /* Donut — counts per ERPNext status, folded into the four stages client-side.
     frappe.desk.listview.get_group_by_count returns [{name, count}].        */
  const grouped = useFrappeGetCall<{ message: GroupCount[] }>(METHOD.groupByCount, {
    doctype: DT.salesOrder,
    current_filters: JSON.stringify(filters),
    field: "status",
  });

  /* Open-order value, permission-filtered, in company currency. The endpoint
     sums base_grand_total, so `currency` is the company default — never
     assume AED here, the totals would be mislabelled the moment anything is
     priced in another currency.                                            */
  const summary = useFrappeGetCall<{
    message: {
      currency: string;
      committed: number; delivered_value: number; billed_value: number;
      unbilled_delivered: number; open_count: number; overdue_count: number;
    };
  }>(METHOD.fulfilmentSummary, {}, undefined, { shouldRetryOnError: false });

  const s = summary.data?.message;
  const cur = s?.currency || "AED";
  const rows = list.data ?? [];

  const stages = useMemo(() => {
    const counts: Record<Stage, number> = { draft: 0, confirmed: 0, delivered: 0, billed: 0 };
    for (const g of grouped.data?.message ?? []) {
      const ui = toUiStatus(g.name);
      if (ui === "Draft") counts.draft += g.count;
      else if (ui === "Completed") counts.billed += g.count;
      else if (ui !== "Cancelled") counts.confirmed += g.count;
    }
    return ([
      { key: "draft", label: t("stage.draft"), n: counts.draft, colour: STAGE_COLOUR.draft },
      { key: "confirmed", label: t("stage.confirmed"), n: counts.confirmed, colour: STAGE_COLOUR.confirmed },
      { key: "delivered", label: t("stage.delivered"), n: counts.delivered, colour: STAGE_COLOUR.delivered },
      { key: "billed", label: t("stage.billed"), n: counts.billed, colour: STAGE_COLOUR.billed },
    ]);
  }, [grouped.data]);

  const stageTotal = stages.reduce((a, b) => a + b.n, 0);

  const columns: Column<Row>[] = [
    { key: "no", header: t("so.col.no"), cell: (o) => <span className="ordno">{o.name}</span> },
    { key: "customer", header: t("so.col.customer"), className: "cust", cell: (o) => o.customer_name || o.customer },
    { key: "date", header: t("so.col.orderDate"), className: "dt", cell: (o) => date(o.transaction_date) },
    {
      key: "delivery", header: t("so.col.deliveryDate"), className: "dt",
      cell: (o) => (
        <span className={isLate(o) ? "late" : undefined}>
          {date(o.delivery_date)}
          {isLate(o) && <span className="latetag"> {t("so.late")}</span>}
        </span>
      ),
    },
    {
      key: "total", header: t("so.col.total"), className: "n tot",
      /* grand_total is in DOCUMENT currency, unlike the base_grand_total the
         tiles sum — so name it whenever it is not the company's own. */
      cell: (o) => (
        <>
          {o.currency && o.currency !== cur && (
            <span className="cur" style={{ marginInlineEnd: 4 }}>{o.currency}</span>
          )}
          {money(o.grand_total)}
        </>
      ),
    },
    {
      key: "fulfilment",
      header: (
        <>
          {t("so.col.fulfilment")}
          <span className="thlegend">
            <span><i style={{ background: "var(--c-delivered)" }} />{t("so.bar.delivered")}</span>
            <span><i style={{ background: "var(--c-billed)" }} />{t("so.bar.billed")}</span>
          </span>
        </>
      ),
      cell: (o) => (
        <div className="ful">
          <div className="fl">
            <MiniBar value={o.per_delivered ?? 0} colour={isLate(o) ? "var(--bad)" : "var(--c-delivered)"} />
            <span className="fpc">{pct(o.per_delivered)}</span>
          </div>
          <div className="fl">
            <MiniBar value={o.per_billed ?? 0} colour="var(--c-billed)" />
            <span className="fpc">{pct(o.per_billed)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status", header: t("so.col.status"),
      cell: (o) => <Pill cls={SO_PILL_CLASS[toUiStatus(o.status)]}>{t(`status.${toUiStatus(o.status)}`)}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        title={t("so.title")}
        sub={t("so.sub")}
        actions={
          <>
            <button className="btn ghost">{t("so.export")}</button>
            <button className="btn" onClick={() => nav("/orders/new")}>＋ {t("so.new")}</button>
          </>
        }
      />

      {s && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6"/>'
            label={t("so.tile.open")} value={s.open_count}
            foot={`${cur} ${money(s.committed)} ${t("so.tile.openFoot")}`} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><circle cx="12.4" cy="10" r="1"/>'
            label={t("so.tile.committed")} value={money(s.committed)} unit={cur}
            foot={t("so.tile.committedFoot")} />
          <StatTile colour="var(--c-delivered)" tint="rgba(8,145,178,.13)"
            icon='<path d="M2 6h8v6H2zM10 8h2.5L15.5 10.5v1.5H10z"/><circle cx="4.5" cy="13.5" r="1.3"/>'
            label={t("so.tile.unbilled")} value={money(s.unbilled_delivered)} unit={cur}
            foot={t("so.tile.unbilledFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("so.tile.late")} value={s.overdue_count} foot={t("so.tile.lateFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("so.chart.stage")} hint={t("so.chart.stageHint")} bodyClass="donutwrap">
          {grouped.isLoading ? <Loading /> : (
            <>
              <Donut data={stages} total={stageTotal} centreLabel={t("so.chart.all")} />
              <Legend data={stages} />
            </>
          )}
        </Card>

        {s && (
          <Card title={t("so.chart.fulfil")} hint={t("so.chart.fulfilHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(s.committed)}</span>
            </div>
            <BarRow label={t("so.bar.delivered")} currency={cur}
              value={s.committed ? (s.delivered_value / s.committed) * 100 : 0}
              amount={s.delivered_value} colour="var(--c-delivered)" />
            <BarRow label={t("so.bar.billed")} currency={cur}
              value={s.committed ? (s.billed_value / s.committed) * 100 : 0}
              amount={s.billed_value} colour="var(--c-billed)" />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("so.col.no")} />
          <LinkFilter doctype={DT.customer} value={customer} onChange={(v) => set("customer", v)}
            placeholder={t("filter.allCustomers")} clearLabel={t("filter.clearCustomer")} />
          <SelectFilter<SoUiStatus>
            value={uiStatus} onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={(["Draft", "Open", "Completed", "Cancelled"] as SoUiStatus[])
              .map((x) => ({ value: x, label: t(`status.${x}`) }))} />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(o) => o.name}
          onOpen={(o) => nav(`/orders/${encodeURIComponent(o.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("list.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE}
          onPage={setPage} note={t("list.orders")} />
      </Card>
    </>
  );
}
