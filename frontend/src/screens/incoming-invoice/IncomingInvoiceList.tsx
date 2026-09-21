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
const STATUSES = ["Received", "Drafted", "Rejected"] as const;
type InStatus = (typeof STATUSES)[number];

const STATUS_COLOUR: Record<InStatus, string> = {
  Received: "var(--warn)",
  Drafted: "var(--c-billed)",
  Rejected: "var(--bad)",
};

type Row = {
  name: string;
  supplier_name?: string;
  supplier_trn?: string;
  issue_date?: string;
  total_amount?: number;
  tax_amount?: number;
  currency?: string;
  status?: string;
  purchase_invoice?: string;
  asp_document_id?: string;
};

type Agg = { name?: string; count?: number; amount?: number };

function inPill(status?: string): string {
  if (status === "Drafted") return "p-done";
  if (status === "Rejected") return "p-cxl";
  return "p-warn";
}

export default function IncomingInvoiceList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const status = get("status") as InStatus | "";
  const company = session.company;
  const paused = !session.user || !company;

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);

  const orFilters = useMemo(() => {
    const text = q.trim();
    if (!text) return undefined;
    const like = `%${text}%`;
    return [
      ["name", "like", like],
      ["supplier_name", "like", like],
      ["asp_document_id", "like", like],
    ] as FilterTuple[];
  }, [q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status) f.push(["status", "=", status]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status]);

  const list = useDocList<Row>(
    DT.incomingInvoice,
    {
      fields: [
        "name", "supplier_name", "supplier_trn", "issue_date", "total_amount",
        "tax_amount", "currency", "status", "purchase_invoice", "asp_document_id",
      ],
      filters,
      orFilters,
      orderBy: { field: "modified", order: "desc" },
      limit: PAGE,
      limit_start: start,
    },
    paused ? null : undefined,
  );
  const count = useDocCount(DT.incomingInvoice, filters, orFilters, paused ? null : undefined);
  const agg = useGroupedAggregate<Agg>(DT.incomingInvoice, {
    fields: [
      { COUNT: "*", as: "count" },
      { SUM: "total_amount", as: "amount" },
      "status as name",
    ],
    filters: baseFilters,
    groupBy: "status",
    enabled: !paused,
  });

  const rows = list.data ?? [];
  const pick = groupRow<Agg>;
  const received = pick(agg.rows, "Received");
  const drafted = pick(agg.rows, "Drafted");
  const rejected = pick(agg.rows, "Rejected");
  const queueValue = Number(received?.amount) || 0;
  const draftedValue = Number(drafted?.amount) || 0;

  const donut = STATUSES.map((s) => ({
    key: s,
    label: t(`in.status.${s}`),
    n: Number(pick(agg.rows, s)?.count) || 0,
    colour: STATUS_COLOUR[s],
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const booked = queueValue + draftedValue;

  const columns: Column<Row>[] = [
    { key: "name", header: t("in.col.id"), cell: (r) => <span className="ordno">{r.asp_document_id || r.name}</span> },
    { key: "supplier", header: t("nav.suppliers"), className: "cust", cell: (r) => r.supplier_name || "—" },
    { key: "trn", header: t("pi.supplierTrn"), className: "mono", cell: (r) => r.supplier_trn || "—" },
    { key: "date", header: t("inv.col.date"), className: "dt", cell: (r) => date(r.issue_date) },
    {
      key: "total", header: t("inv.col.total"), className: "n tot",
      cell: (r) => (
        <>
          {r.currency && r.currency !== cur && <span className="cur">{r.currency}</span>}
          {money(r.total_amount)}
        </>
      ),
    },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={inPill(r.status)}>{r.status ? t(`in.status.${r.status}`) : "—"}</Pill>,
    },
    { key: "pi", header: t("pi.col.no"), cell: (r) => r.purchase_invoice || "—" },
  ];

  return (
    <>
      <PageHead title={t("in.title")} />

      {agg.ready && (
        <div className="tiles">
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h3.5"/>'
            label={t("in.tile.queue")} value={Number(received?.count) || 0}
            foot={`${cur ? `${cur} ` : ""}${money(queueValue)} ${t("in.tile.queueFoot")}`} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><circle cx="12.4" cy="10" r="1"/>'
            label={t("in.tile.drafted")} value={Number(drafted?.count) || 0}
            foot={t("in.tile.draftedFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("in.tile.rejected")} value={Number(rejected?.count) || 0}
            foot={t("in.tile.rejectedFoot")} />
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6"/>'
            label={t("in.tile.value")} value={money(queueValue)}
            foot={t("in.tile.valueFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("in.chart.status")} bodyClass="donutwrap">
          {paused || agg.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("in.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {agg.ready && (
          <Card title={t("in.chart.flow")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(booked)}</span>
            </div>
            <BarRow label={t("in.bar.queue")} currency={cur}
              value={booked ? (queueValue / booked) * 100 : 0}
              amount={queueValue} colour="var(--warn)" />
            <BarRow label={t("in.bar.drafted")} currency={cur}
              value={booked ? (draftedValue / booked) * 100 : 0}
              amount={draftedValue} colour="var(--c-billed)" />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("in.search")} />
          <SelectFilter
            value={status}
            onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={STATUSES.map((s) => ({ value: s, label: t(`in.status.${s}`) }))}
          />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/incoming-invoices/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("in.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
