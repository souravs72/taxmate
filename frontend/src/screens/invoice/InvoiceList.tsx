import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDocList, useDocCount } from "../../lib/resource";
import {
  useFilteredCount, useGroupedAggregate, useListParams, type FilterTuple,
} from "../../lib/list";
import { date, money } from "../../lib/format";
import {
  EINVOICE_CHIP, INV_PILL_CLASS, INV_STAGE_COLOUR, INV_UI_STATUSES,
  countsTowardBilled, invoiceQueryFor, invoiceStage, invoiceUiStatus, isInvoiceOverdue,
  type InvStage, type InvUiStatus,
} from "../../lib/status";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, ErrorBox, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "../../components/filters";
import { useSession } from "../../lib/session";

const PAGE = 20;
const E_FAILED = ["Failed", "Rejected"];
const E_STATES = ["Draft", "Generated", "Queued", "Submitted", "Accepted", "Rejected", "Failed"];

type Row = {
  name: string; customer?: string; customer_name?: string; posting_date?: string; due_date?: string;
  grand_total?: number; outstanding_amount?: number; currency?: string;
  status?: string; docstatus?: number;
  is_return?: number; uae_e_invoice_status?: string; vat_emirate?: string; po_no?: string;
};

/** One row per ERPNext status, from the aggregate call. */
type Agg = { name?: string; count?: number; billed?: number; outstanding?: number };

export default function InvoiceList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const params = useListParams(PAGE);
  const { get, page, setPage, start } = params;

  const q = get("q");
  const status = get("status") as InvUiStatus | "";
  const customer = get("customer");
  const einvoice = get("einvoice");
  const emirate = get("emirate");

  /* Changing a filter drops the selection — the rows it referred to are
     about to be replaced.                                               */
  const set = (key: string, value: string) => { params.set(key, value); setPicked(new Set()); };

  /* Everything except status. The tiles and the donut describe the whole
     filtered book, so selecting a status narrows the table but not them. */
  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (customer) f.push(["customer", "=", customer]);
    if (einvoice) f.push(["uae_e_invoice_status", "=", einvoice]);
    if (emirate) f.push(["vat_emirate", "=", emirate]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [customer, einvoice, emirate, q]);

  const query = useMemo(
    () => (status ? invoiceQueryFor(status) : { filters: [] as FilterTuple[] }),
    [status],
  );
  const filters = useMemo(
    () => [...baseFilters, ...query.filters] as unknown as Filter<Row>[],
    [baseFilters, query],
  );
  const orFilters = query.orFilters as unknown as Filter<Row>[] | undefined;

  const list = useDocList<Row>(DT.salesInvoice, {
    fields: ["name", "customer", "customer_name", "posting_date", "due_date", "grand_total",
      "outstanding_amount", "currency", "status", "docstatus", "is_return",
      "uae_e_invoice_status", "vat_emirate", "po_no"],
    filters,
    orFilters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const { total } = useFilteredCount(
    DT.salesInvoice,
    filters as unknown as FilterTuple[],
    orFilters as unknown as FilterTuple[] | undefined,
  );

  /* Counts and money per ERPNext status, in ONE call. frappe.client.get_list
     takes dict fields and a group_by — the same shape Frappe's own
     get_group_by_count uses — so there is no custom endpoint behind this.  */
  const agg = useGroupedAggregate<Agg>(DT.salesInvoice, {
    fields: [
      { COUNT: "*", as: "count" },
      { SUM: "base_grand_total", as: "billed" },
      { SUM: "outstanding_amount", as: "outstanding" },
      "status as name",
    ],
    filters: baseFilters,
    groupBy: "status",
  });

  /* Overdue is derived, so it needs its own pass — there is no stored column
     that answers it reliably (see lib/status.ts).                          */
  const overdue = useGroupedAggregate<Agg>(DT.salesInvoice, {
    fields: [
      { COUNT: "*", as: "count" },
      { SUM: "outstanding_amount", as: "outstanding" },
      "docstatus as name",
    ],
    filters: [...baseFilters, ...invoiceQueryFor("Overdue").filters],
    orFilters: invoiceQueryFor("Overdue").orFilters,
    groupBy: "docstatus",
  });

  const eFailed = useDocCount(
    DT.salesInvoice,
    [...baseFilters, ["uae_e_invoice_status", "in", E_FAILED]] as unknown as Filter<Row>[],
  );

  const bulk = useFrappePostCall<{ message: unknown }>(METHOD.bulkGenerateEInvoices);

  const totals = useMemo(() => {
    const stages: Record<InvStage, number> = { draft: 0, unpaid: 0, paid: 0, closed: 0 };
    let billed = 0, outstandingValue = 0;
    for (const row of agg.rows) {
      stages[invoiceStage(row.name)] += Number(row.count) || 0;
      // A credit note and an internal transfer BOTH posted to the ledger, so
      // they belong in the money even though the donut groups them with
      // Cancelled. Only Draft and Cancelled are genuinely out.
      if (!countsTowardBilled(row.name)) continue;
      billed += Number(row.billed) || 0;
      outstandingValue += Number(row.outstanding) || 0;
    }
    return { stages, billed, outstanding: outstandingValue, collected: Math.max(billed - outstandingValue, 0) };
  }, [agg.rows]);

  const overdueRows = overdue.rows;
  const overdueCount = overdueRows.reduce((a, r) => a + (Number(r.count) || 0), 0);
  const overdueValue = overdueRows.reduce((a, r) => a + (Number(r.outstanding) || 0), 0);

  const donut = ([
    { key: "draft", label: t("inv.status.Draft"), n: totals.stages.draft, colour: INV_STAGE_COLOUR.draft },
    { key: "unpaid", label: t("inv.stage.unpaid"), n: totals.stages.unpaid, colour: INV_STAGE_COLOUR.unpaid },
    { key: "paid", label: t("inv.status.Paid"), n: totals.stages.paid, colour: INV_STAGE_COLOUR.paid },
    { key: "closed", label: t("inv.stage.closed"), n: totals.stages.closed, colour: INV_STAGE_COLOUR.closed },
  ]);
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);

  const rows = list.data ?? [];
  const aggReady = agg.ready;

  /* Only a submitted invoice with a failed or missing report can be resent. */
  const resendable = (r: Row) =>
    r.docstatus === 1 && (!r.uae_e_invoice_status || E_FAILED.includes(r.uae_e_invoice_status));
  const pickedNames = [...picked];

  const columns: Column<Row>[] = [
    { key: "no", header: t("inv.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "customer", header: t("so.col.customer"), className: "cust", cell: (r) => r.customer_name || r.customer },
    { key: "date", header: t("inv.col.date"), className: "dt", cell: (r) => date(r.posting_date) },
    {
      key: "due", header: t("inv.due"),
      className: "dt",
      cell: (r) => <span className={isInvoiceOverdue(r) ? "late" : undefined}>{date(r.due_date)}</span>,
    },
    {
      key: "total", header: t("inv.col.total"), className: "n tot",
      /* grand_total is in the invoice's OWN currency. The tiles sum
         base_grand_total, so name any row that is not the company's. */
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
      cell: (r) => <Pill cls={INV_PILL_CLASS[invoiceUiStatus(r)]}>{t(`inv.status.${invoiceUiStatus(r)}`)}</Pill>,
    },
    {
      key: "einvoice", header: t("inv.col.einvoice"),
      cell: (r) => (
        <span className={`echip ${r.uae_e_invoice_status ? EINVOICE_CHIP[r.uae_e_invoice_status] ?? "e-none" : "e-none"}`}>
          {r.uae_e_invoice_status || "—"}
        </span>
      ),
    },
  ];

  function togglePick(name: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  async function submitPicked() {
    try {
      await bulk.call({ docnames: JSON.stringify(pickedNames), doctype: DT.salesInvoice });
      setPicked(new Set());
      await list.mutate();
    } catch { /* surfaced through bulk.error */ }
  }

  return (
    <>
      <PageHead
        title={t("inv.title")}
        sub={t("inv.sub")}
        actions={<button className="btn" onClick={() => nav("/invoices/new")}>＋ {t("inv.new")}</button>}
      />

      {aggReady && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h3.5"/>'
            label={t("inv.tile.outstanding")} value={money(totals.outstanding)} unit={cur}
            foot={`${totals.stages.unpaid} ${t("inv.tile.outstandingFoot")}`} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("inv.tile.overdue")} value={money(overdueValue)} unit={cur}
            foot={`${overdueCount} ${t("inv.tile.overdueFoot")}`} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><circle cx="12.4" cy="10" r="1"/>'
            label={t("inv.tile.collected")} value={money(totals.collected)} unit={cur}
            foot={t("inv.tile.collectedFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M9 2.5l5.5 2.2V10c0 3.3-2.4 5.7-5.5 6.5C5.9 15.7 3.5 13.3 3.5 10V4.7z"/><path d="M9 6.2v3.4M9 11.4v.6"/>'
            label={t("inv.tile.eFailed")} value={eFailed.data ?? 0} foot={t("inv.tile.eFailedFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("inv.chart.status")} hint={t("inv.chart.statusHint")} bodyClass="donutwrap">
          {agg.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("inv.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>

        {aggReady && (
          <Card title={t("inv.chart.collection")} hint={t("inv.chart.collectionHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(totals.billed)}</span>
            </div>
            <BarRow label={t("inv.bar.collected")} currency={cur}
              value={totals.billed ? (totals.collected / totals.billed) * 100 : 0}
              amount={totals.collected} colour="var(--c-billed)" />
            <BarRow label={t("inv.bar.outstanding")} currency={cur}
              value={totals.billed ? (totals.outstanding / totals.billed) * 100 : 0}
              amount={totals.outstanding} colour="var(--c-confirmed)" />
            {overdueValue > 0 && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                {cur} {money(overdueValue)} {t("inv.bar.overdueNote")}
              </p>
            )}
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("inv.search")} />
          <LinkFilter doctype={DT.customer} value={customer} onChange={(v) => set("customer", v)}
            placeholder={t("filter.allCustomers")} clearLabel={t("filter.clearCustomer")} />
          <SelectFilter<InvUiStatus>
            value={status} onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={INV_UI_STATUSES.map((x) => ({ value: x, label: t(`inv.status.${x}`) }))} />
          <SelectFilter
            value={einvoice} onChange={(v) => set("einvoice", v)}
            allLabel={t("inv.allEinvoice")}
            options={E_STATES.map((x) => ({ value: x, label: x }))} />
          <SelectFilter
            value={emirate} onChange={(v) => set("emirate", v)}
            allLabel={t("inv.allEmirates")}
            options={UAE_EMIRATES.map((x) => ({ value: x, label: x }))} />
        </FilterBar>

        {picked.size > 0 && (
          <div className="bulkbar">
            <span className="msg">{picked.size} {t("inv.bulk.selected")}</span>
            <div className="grp">
              <button className="btn sm" disabled={bulk.loading} onClick={() => void submitPicked()}>
                {bulk.loading ? t("soc.saving") : t("inv.bulk.submit")}
              </button>
              <button className="btn ghost sm" onClick={() => setPicked(new Set())}>{t("inv.bulk.clear")}</button>
            </div>
          </div>
        )}
        {(bulk.error || agg.error || overdue.error) && (
          <ErrorBox error={bulk.error ?? agg.error ?? overdue.error} />
        )}

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/invoices/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("inv.empty")}
          columns={columns}
          selection={{
            picked,
            selectable: resendable,
            label: t("inv.bulk.selectAll"),
            onToggle: togglePick,
            onToggleAll: (checked) => setPicked(
              checked ? new Set(rows.filter(resendable).map((r) => r.name)) : new Set(),
            ),
          }}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE}
          onPage={setPage} note={`${t("list.invoices")} · ${cur}`} />
      </Card>
    </>
  );
}
