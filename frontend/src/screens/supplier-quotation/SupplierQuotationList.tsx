/**
 * SupplierQuotationList — Phase 16.
 * Callers: App.tsx /supplier-quotations
 * API: taxmate.api.resource.get_list on "Supplier Quotation"
 */
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useDocList, useDocCount } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useListParams } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = {
  name: string; supplier?: string; supplier_name?: string;
  transaction_date?: string; status?: string; grand_total?: number; currency?: string;
};

function sqPill(status?: string): string {
  if (!status || status === "Draft") return "p-draft";
  if (status === "Ordered") return "p-done";
  if (status === "Cancelled" || status === "Expired") return "p-cxl";
  return "p-open";
}

export default function SupplierQuotationList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const company = session.company;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (company) f.push(["company", "=", company]);
    if (q.trim()) f.push(["supplier_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [company, q]);

  const list = useDocList<Row>(DT.supplierQuotation, {
    fields: ["name", "supplier", "supplier_name", "transaction_date", "status", "grand_total", "currency", "docstatus"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.supplierQuotation, filters);

  const columns: Column<Row>[] = [
    { key: "name", header: t("sq.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "supplier", header: t("sq.col.supplier"), cell: (r) => r.supplier_name || r.supplier || "—" },
    { key: "date", header: t("sq.col.date"), cell: (r) => date(r.transaction_date) },
    {
      key: "status", header: t("sq.col.status"),
      cell: (r) => <Pill cls={sqPill(r.status)}>{r.status || "Draft"}</Pill>,
    },
    { key: "total", header: t("sq.col.total"), role: "amount", cell: (r) => `${r.currency || ""} ${money(r.grand_total)}`.trim() },
  ];


  const rows = list.data ?? [];
  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.supplierQuotation,
    onDone: refreshList,
    enabled: writable,
    clearDeps: [q, page],
  });

  return (
    <>
      <PageHead title={t("sq.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/supplier-quotations/new")}>{t("sq.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("sq.search")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/supplier-quotations/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("sq.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
