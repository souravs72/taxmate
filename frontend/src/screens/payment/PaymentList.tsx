import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useDocList } from "../../lib/resource";

import { DT } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import {
  groupRow, useFilteredCount, useGroupedAggregate, useListParams, type FilterTuple,
} from "../../lib/list";
import { date, money } from "../../lib/format";
import {
  COVERAGE_COLOUR, COVERAGE_KEY, PARTY_TYPE, PAY_PILL, PAY_STATUSES, PAY_STATUS_COLOUR,
  coverageOf, payStatus, type PayStatus, type PayType,
} from "../../lib/payments";
import { t } from "../../i18n/strings";
import { Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import {
  DateRangeFilter, FilterBar, LinkFilter, SearchFilter, SelectFilter,
} from "../../components/filters";

const PAGE = 20;

type Row = {
  name: string; payment_type?: PayType; party_type?: string; party?: string; party_name?: string;
  posting_date?: string; paid_amount?: number; base_paid_amount?: number;
  total_allocated_amount?: number; unallocated_amount?: number;
  mode_of_payment?: string; status?: string; docstatus?: number;
};

/** One row per group, from frappe.client.get_list with a group_by. */
type Agg = { name?: string; count?: number; paid?: number; unallocated?: number };

export default function PaymentList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);

  const q = get("q");
  const type = get("type") as PayType | "";
  const party = get("party");
  const status = get("status") as PayStatus | "";
  const from = get("from");
  const to = get("to");

  /* The period and party scope the dashboard; status and type narrow the
     table only, so the donut still shows the whole period's split.      */
  const periodFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (party) f.push(["party", "=", party]);
    if (from) f.push(["posting_date", ">=", from]);
    if (to) f.push(["posting_date", "<=", to]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [party, from, to, q]);

  const filters = useMemo(() => {
    const f = [...periodFilters];
    if (type) f.push(["payment_type", "=", type]);
    if (status === "Draft") f.push(["docstatus", "=", 0]);
    else if (status === "Submitted") f.push(["docstatus", "=", 1]);
    else if (status === "Cancelled") f.push(["docstatus", "=", 2]);
    return f as unknown as Filter<Row>[];
  }, [periodFilters, type, status]);

  const list = useDocList<Row>(DT.paymentEntry, {
    fields: ["name", "payment_type", "party_type", "party", "party_name", "posting_date",
      "paid_amount", "base_paid_amount", "total_allocated_amount", "unallocated_amount",
      "mode_of_payment", "status", "docstatus"],
    filters,
    orderBy: { field: "posting_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const { total } = useFilteredCount(DT.paymentEntry, filters as unknown as FilterTuple[]);

  /* Counts per status, in one call. `status` on Payment Entry is a stored
     Select whose options are exactly Draft / Submitted / Cancelled, so the
     donut needs no mapping.                                              */
  const byStatus = useGroupedAggregate<Agg>(DT.paymentEntry, {
    fields: [{ COUNT: "*", as: "count" }, { SUM: "base_paid_amount", as: "paid" }, "status as name"],
    filters: periodFilters,
    groupBy: "status",
  });

  /* Money movement: submitted payments only, split by direction.
     base_paid_amount is company currency — paid_amount is the account's. */
  const byType = useGroupedAggregate<Agg>(DT.paymentEntry, {
    fields: [
      { COUNT: "*", as: "count" },
      { SUM: "base_paid_amount", as: "paid" },
      { SUM: "unallocated_amount", as: "unallocated" },
      "payment_type as name",
    ],
    filters: [...periodFilters, ["docstatus", "=", 1]],
    groupBy: "payment_type",
  });

  const statusRows = byStatus.rows;
  const typeRows = byType.rows;
  const pick = groupRow<Agg>;

  const received = Number(pick(typeRows, "Receive")?.paid) || 0;
  const paid = Number(pick(typeRows, "Pay")?.paid) || 0;
  const unallocated = Number(pick(typeRows, "Receive")?.unallocated) || 0;
  const drafts = Number(pick(statusRows, "Draft")?.count) || 0;
  // Share of all movement — a percentage of the larger bar would say nothing.
  const moved = Math.max(received + paid, 1);

  const donut = PAY_STATUSES.map((s) => ({
    key: s,
    label: t(`pay.status.${s}`),
    n: Number(pick(statusRows, s)?.count) || 0,
    value: Number(pick(statusRows, s)?.paid) || 0,
    colour: PAY_STATUS_COLOUR[s],
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);

  const rows = list.data ?? [];
  const ready = byStatus.ready && byType.ready;
  const anyError = list.error || byStatus.error || byType.error;

  const columns: Column<Row>[] = [
    { key: "no", header: t("pay.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "type", header: t("pay.col.type"), cell: (r) => <DirChip type={r.payment_type ?? "Receive"} /> },
    {
      key: "party", header: t("pay.col.party"), className: "cust",
      cell: (r) => (
        <>
          {r.party_name || r.party}
          <small>{t(`pay.party.${r.party_type ?? PARTY_TYPE[r.payment_type ?? "Receive"]}`)}</small>
        </>
      ),
    },
    { key: "date", header: t("pay.col.date"), className: "dt", cell: (r) => date(r.posting_date) },
    { key: "amount", header: t("pay.col.amount"), className: "n tot", cell: (r) => money(r.paid_amount) },
    { key: "alloc", header: t("pay.col.allocated"), cell: (r) => <CoverageMeter row={r} status={payStatus(r)} /> },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={PAY_PILL[payStatus(r)]}>{t(`pay.status.${payStatus(r)}`)}</Pill>,
    },
  ];

  const open = (r: Row) => nav(
    r.docstatus === 0
      ? `/payments/${encodeURIComponent(r.name)}/edit`
      : `/payments/${encodeURIComponent(r.name)}`,
  );

  return (
    <>
      <PageHead
        title={t("pay.title")}
        sub={t("pay.sub")}
        actions={
          <>
            <button className="btn ghost" onClick={() => nav("/payments/new?type=Pay")}>
              ＋ {t("pay.newOut")}
            </button>
            <button className="btn" onClick={() => nav("/payments/new")}>
              ＋ {t("pay.new")}
            </button>
          </>
        }
      />

      {ready && (
        <div className="tiles">
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M9 3.5v11"/><path d="M5 10.5 9 14.5l4-4"/>'
            label={t("pay.tile.received")} value={money(received)} unit={cur}
            foot={t("pay.tile.receivedFoot")} />
          <StatTile colour="var(--c-delivered)" tint="rgba(8,145,178,.13)"
            icon='<path d="M9 14.5v-11"/><path d="M5 7.5 9 3.5l4 4"/>'
            label={t("pay.tile.paid")} value={money(paid)} unit={cur}
            foot={t("pay.tile.paidFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<circle cx="9" cy="9" r="6.5"/><path d="M9 5.5v4M9 11.8v.6"/>'
            label={t("pay.tile.unallocated")} value={money(unallocated)} unit={cur}
            foot={t("pay.tile.unallocatedFoot")} />
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h3.5"/>'
            label={t("pay.tile.drafts")} value={drafts} foot={t("pay.tile.draftsFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("pay.chart.status")} hint={t("pay.chart.statusHint")} bodyClass="donutwrap">
          {byStatus.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("pay.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>

        {ready && (
          <Card title={t("pay.chart.movement")} hint={t("pay.chart.movementHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(received - paid)}</span>
              <span className="c">{t("pay.bar.net")}</span>
            </div>
            <BarLine label={t("pay.bar.in")} amount={received} pct={received / moved * 100}
              colour="var(--c-billed)" currency={cur} />
            <BarLine label={t("pay.bar.out")} amount={paid} pct={paid / moved * 100}
              colour="var(--c-delivered)" currency={cur} />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("pay.col.no")} />
          <SelectFilter<PayType>
            value={type} onChange={(v) => set("type", v)}
            allLabel={t("pay.filter.allTypes")}
            options={[
              { value: "Receive", label: t("pay.type.Receive") },
              { value: "Pay", label: t("pay.type.Pay") },
            ]} />
          {/* The party doctype follows the direction; with no type chosen,
              Customer is the common case.                                */}
          <LinkFilter doctype={type === "Pay" ? DT.supplier : DT.customer}
            value={party} onChange={(v) => set("party", v)}
            placeholder={t("pay.filter.allParties")} clearLabel={t("pay.filter.clearParty")} />
          <SelectFilter<PayStatus>
            value={status} onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={PAY_STATUSES.map((x) => ({ value: x, label: t(`pay.status.${x}`) }))} />
          <DateRangeFilter from={from} to={to}
            onFrom={(v) => set("from", v)} onTo={(v) => set("to", v)} />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={open}
          state={{ isLoading: list.isLoading, error: anyError, onRetry: () => list.mutate() }}
          emptyLabel={t("pay.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE}
          onPage={setPage} note={`${t("pay.payments")} · ${cur}`} />
      </Card>
    </>
  );
}

/** Money in vs money out, coloured so direction reads without the label. */
export function DirChip({ type }: { type: PayType }) {
  const inbound = type === "Receive";
  return (
    <span className={`dir ${inbound ? "in" : "out"}`}>
      <span className="ar">{inbound ? "↓" : "↑"}</span>
      {t(`pay.type.${type}`)}
    </span>
  );
}

function CoverageMeter({ row, status }: { row: Row; status: PayStatus }) {
  if (status === "Cancelled") return <span style={{ color: "var(--faint)", fontSize: 11.5 }}>—</span>;
  const paidAmt = Number(row.paid_amount) || 0;
  const alloc = Number(row.total_allocated_amount) || 0;
  const cov = coverageOf(paidAmt, alloc);
  const pct = paidAmt ? Math.min(100, Math.round((alloc / paidAmt) * 100)) : 0;
  return (
    <div className="cov">
      <div className="covtop">
        <span className="lbl">{t(COVERAGE_KEY[cov])}</span>
        <b>{pct}%</b>
      </div>
      <div className="covtrack"><i style={{ width: `${pct}%`, background: COVERAGE_COLOUR[cov] }} /></div>
    </div>
  );
}

function BarLine({ label, amount, pct, colour, currency }: {
  label: string; amount: number; pct: number; colour: string; currency: string;
}) {
  return (
    <div className="bar">
      <div className="lab">
        <span className="l"><i className="sw" style={{ background: colour }} />{label}</span>
        <span className="r">{Math.round(pct)}%<small>{currency} {money(amount)}</small></span>
      </div>
      <div className="track"><i style={{ width: `${pct}%`, background: colour }} /></div>
    </div>
  );
}
