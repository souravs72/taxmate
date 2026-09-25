/**
 * POS Invoice list screen.
 * Importers: App.tsx route /pos-invoices.
 * API: taxmate.api.resource.get_list on POS Invoice.
 * Schema: name, customer, posting_date, grand_total, currency, docstatus, is_return.
 * User: "Implement the plan… complete all the to-dos."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 20;

type Row = {
  name: string;
  customer?: string;
  posting_date?: string;
  grand_total?: number;
  currency?: string;
  docstatus?: number;
  is_return?: 0 | 1;
};

function pillCls(r: Row): string {
  if (r.is_return) return "p-cxl";
  if (r.docstatus === 1) return "p-done";
  if (r.docstatus === 2) return "p-cxl";
  return "p-draft";
}

function statusLabel(r: Row): string {
  if (r.is_return) return t("inv.status.Return");
  if (r.docstatus === 1) return t("pos.statusPaid");
  if (r.docstatus === 2) return t("inv.status.Cancelled");
  return t("inv.status.Draft");
}

export default function PosInvoiceList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    if (session.company) f.push(["company", "=", session.company]);
    return f;
  }, [q, session.company]);

  const list = useDocList<Row>(DT.posInvoice, {
    fields: ["name", "customer", "posting_date", "grand_total", "currency", "docstatus", "is_return"],
    filters: filters as never,
    orderBy: { field: "posting_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.posInvoice, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("pos.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "customer", header: t("pos.col.customer"), cell: (r) => r.customer || t("pos.walkIn") },
    { key: "date", header: t("pos.col.date"), cell: (r) => date(r.posting_date) },
    { key: "total", header: t("pos.col.total"), cell: (r) => money(r.grand_total) },
    { key: "status", header: t("pos.col.status"), cell: (r) => <Pill cls={pillCls(r)}>{statusLabel(r)}</Pill> },
  ];

  return (
    <>
      <PageHead
        title={t("pos.title")}
        actions={<button className="btn" onClick={() => nav("/pos-invoices/new")}>{t("pos.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("pos.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/pos-invoices/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("pos.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
