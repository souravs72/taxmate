import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;

/** ERPNext Purchase Invoice.status options. */
const PI_STATUSES = [
  "Draft",
  "Unpaid",
  "Partly Paid",
  "Paid",
  "Overdue",
  "Return",
  "Debit Note Issued",
  "Cancelled",
] as const;

type PiStatus = (typeof PI_STATUSES)[number];
type PiStage = "draft" | "unpaid" | "paid" | "closed";

const STAGE_COLOUR: Record<PiStage, string> = {
  draft: "var(--muted)",
  unpaid: "var(--c-confirmed)",
  paid: "var(--c-billed)",
  closed: "var(--cxl, #94a3b8)",
};

type Row = {
  name: string;
  supplier?: string;
  supplier_name?: string;
  posting_date?: string;
  grand_total?: number;
  outstanding_amount?: number;
  currency?: string;
  status?: string;
  bill_no?: string;
};

type Agg = { name?: string; count?: number; billed?: number; outstanding?: number };

function piPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Paid") return "p-done";
  if (status === "Cancelled") return "p-cxl";
  if (status === "Overdue" || status === "Return") return "p-warn";
  return "p-open";
}

function piStage(status?: string): PiStage {
  if (status === "Draft") return "draft";
  if (status === "Paid") return "paid";
  if (status === "Cancelled" || status === "Return" || status === "Debit Note Issued") return "closed";
  return "unpaid";
}

function countsTowardBilled(status?: string): boolean {
  return status !== "Draft" && status !== "Cancelled";
}

export default function PurchaseInvoiceList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const supplier = get("supplier");
  const status = get("status") as PiStatus | "";
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
    DT.purchaseInvoice,
    {
      fields: [
        "name", "supplier", "supplier_name", "posting_date", "grand_total",
        "outstanding_amount", "currency", "status", "bill_no",
      ],
      filters,
      orderBy: { field: "modified", order: "desc" },
      limit: PAGE,
      limit_start: start,
    },
    paused ? null : undefined,
  );
  const count = useDocCount(DT.purchaseInvoice, filters, undefined, paused ? null : undefined);
  const agg = useGroupedAggregate<Agg>(DT.purchaseInvoice, {
    fields: [
      { COUNT: "*", as: "count" },
      { SUM: "base_grand_total", as: "billed" },
      { SUM: "outstanding_amount", as: "outstanding" },
      "status as name",
    ],
    filters: baseFilters,
    groupBy: "status",
    enabled: !paused,
  });
  const rows = list.data ?? [];

  const totals = useMemo(() => {
    const stages: Record<PiStage, number> = { draft: 0, unpaid: 0, paid: 0, closed: 0 };
    let billed = 0;
    let outstandingValue = 0;
    let overdueCount = 0;
    let overdueValue = 0;
    for (const row of agg.rows) {
      stages[piStage(row.name)] += Number(row.count) || 0;
      if (row.name === "Overdue") {
        overdueCount += Number(row.count) || 0;
        overdueValue += Number(row.outstanding) || 0;
      }
      if (!countsTowardBilled(row.name)) continue;
      billed += Number(row.billed) || 0;
      outstandingValue += Number(row.outstanding) || 0;
    }
    return {
      stages,
      billed,
      outstanding: outstandingValue,
      paid: Math.max(billed - outstandingValue, 0),
      overdueCount,
      overdueValue,
    };
  }, [agg.rows]);

  const donut = ([
    { key: "draft", label: t("inv.status.Draft"), n: totals.stages.draft, colour: STAGE_COLOUR.draft },
    { key: "unpaid", label: t("inv.stage.unpaid"), n: totals.stages.unpaid, colour: STAGE_COLOUR.unpaid },
    { key: "paid", label: t("inv.status.Paid"), n: totals.stages.paid, colour: STAGE_COLOUR.paid },
    { key: "closed", label: t("inv.stage.closed"), n: totals.stages.closed, colour: STAGE_COLOUR.closed },
  ]);
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("pi.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "supplier", header: t("nav.suppliers"), className: "cust", cell: (r) => r.supplier_name || r.supplier || "—" },
    { key: "date", header: t("inv.col.date"), className: "dt", cell: (r) => date(r.posting_date) },
    {
      key: "bill",
      header: t("pi.billNo"),
      cell: (r) => r.bill_no || "—",
    },
    {
      key: "total", header: t("inv.col.total"), className: "n tot",
      cell: (r) => (
        <>
          {r.currency && r.currency !== cur && <span className="cur">{r.currency}</span>}
          {money(r.grand_total)}
        </>
      ),
    },
    { key: "outstanding", header: t("inv.col.outstanding"), className: "n", cell: (r) => money(r.outstanding_amount) },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={piPill(r.status)}>{r.status || "—"}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        title={t("pi.title")}
        sub={t("pi.sub")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/purchase-invoices/new")}>
              ＋ {t("pi.new")}
            </button>
          ) : null
        }
      />

      {agg.ready && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h3.5"/>'
            label={t("pi.tile.outstanding")} value={money(totals.outstanding)} unit={cur}
            foot={`${totals.stages.unpaid} ${t("pi.tile.outstandingFoot")}`} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("pi.tile.overdue")} value={money(totals.overdueValue)} unit={cur}
            foot={`${totals.overdueCount} ${t("pi.tile.overdueFoot")}`} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><circle cx="12.4" cy="10" r="1"/>'
            label={t("pi.tile.paid")} value={money(totals.paid)} unit={cur}
            foot={t("pi.tile.paidFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6"/>'
            label={t("pi.tile.drafts")} value={totals.stages.draft}
            foot={t("pi.tile.draftsFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("pi.chart.status")} hint={t("pi.chart.statusHint")} bodyClass="donutwrap">
          {paused || agg.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("pi.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {agg.ready && (
          <Card title={t("pi.chart.settlement")} hint={t("pi.chart.settlementHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(totals.billed)}</span>
            </div>
            <BarRow label={t("pi.bar.paid")} currency={cur}
              value={totals.billed ? (totals.paid / totals.billed) * 100 : 0}
              amount={totals.paid} colour="var(--c-billed)" />
            <BarRow label={t("pi.bar.outstanding")} currency={cur}
              value={totals.billed ? (totals.outstanding / totals.billed) * 100 : 0}
              amount={totals.outstanding} colour="var(--c-confirmed)" />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("pi.search")} />
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
            options={PI_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/purchase-invoices/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("pi.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
