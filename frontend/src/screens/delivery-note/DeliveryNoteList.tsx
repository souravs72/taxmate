import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useFilteredCount, useListParams, type FilterTuple } from "../../lib/list";
import { date, money, pct } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, MiniBar, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, LinkFilter, SearchFilter, SelectFilter } from "../../components/filters";

/* Callers: App.tsx /delivery-notes. API: DT.deliveryNote list. User: Implement the plan… complete all the to-dos. */

const PAGE = 20;

/** ERPNext Delivery Note.status options (delivery_note.json). */
const DN_STATUSES = [
  "Draft",
  "To Bill",
  "Partially Billed",
  "Completed",
  "Return",
  "Return Issued",
  "Cancelled",
  "Closed",
] as const;

type DnStatus = (typeof DN_STATUSES)[number];

type Row = {
  name: string;
  customer?: string;
  customer_name?: string;
  posting_date?: string;
  grand_total?: number;
  currency?: string;
  status?: string;
  per_billed?: number;
};

function dnPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  if (status === "Return" || status === "Return Issued") return "p-warn";
  return "p-open";
}

export default function DeliveryNoteList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const customer = get("customer");
  const status = get("status") as DnStatus | "";

  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (customer) f.push(["customer", "=", customer]);
    if (status) f.push(["status", "=", status]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [customer, status, q]);

  const list = useDocList<Row>(DT.deliveryNote, {
    fields: ["name", "customer", "customer_name", "posting_date", "grand_total", "currency", "status", "per_billed"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const { total } = useFilteredCount(DT.deliveryNote, filters as unknown as FilterTuple[]);
  const rows = list.data ?? [];

  const columns: Column<Row>[] = [
    { key: "name", header: t("dn.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "customer", header: t("so.col.customer"), className: "cust", cell: (r) => r.customer_name || r.customer || "—" },
    { key: "date", header: t("dn.date"), className: "dt", cell: (r) => date(r.posting_date) },
    {
      key: "total", header: t("dn.grand"), className: "n tot",
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
      key: "status", header: t("dn.status"),
      cell: (r) => <Pill cls={dnPill(r.status)}>{r.status || "—"}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        title={t("dn.listTitle")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/delivery-notes/new")}>
              {t("dn.new")}
            </button>
          ) : null
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("dn.search")} />
          <LinkFilter
            doctype={DT.customer}
            value={customer}
            onChange={(v) => set("customer", v)}
            placeholder={t("filter.allCustomers")}
            clearLabel={t("filter.clearCustomer")}
          />
          <SelectFilter
            value={status}
            onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={DN_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/delivery-notes/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("dn.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
