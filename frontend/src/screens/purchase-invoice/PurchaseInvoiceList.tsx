import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams, type FilterTuple } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
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

function piPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Paid") return "p-done";
  if (status === "Cancelled") return "p-cxl";
  if (status === "Overdue" || status === "Return") return "p-warn";
  return "p-open";
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

  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    if (supplier) f.push(["supplier", "=", supplier]);
    if (status) f.push(["status", "=", status]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [company, supplier, status, q]);

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
  const rows = list.data ?? [];

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
          <button type="button" className="btn" onClick={() => nav("/purchase-invoices/new")}>
            ＋ {t("pi.new")}
          </button>
        }
      />
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
