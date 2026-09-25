// Quotation list. Importers: App.tsx. API: taxmate.api.resource.get_list on Quotation.
// Schema: name,customer_name,transaction_date,status,grand_total,docstatus.
// User: "Implement the plan as specified… complete all the to-dos."
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

type Row = { name: string; customer_name?: string; transaction_date?: string; status?: string; grand_total?: number; };

function quotPill(status?: string): string {
  if (status === "Cancelled") return "p-cxl";
  if (status === "Ordered") return "p-done";
  if (status === "Open") return "p-open";
  return "p-draft";
}

export default function QuotationList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const list = useDocList<Row>(DT.quotation, {
    fields: ["name", "customer_name", "transaction_date", "status", "grand_total"],
    filters: filters as never,
    orderBy: { field: "transaction_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.quotation, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("quot.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "customer", header: t("quot.col.customer"), cell: (r) => r.customer_name || "—" },
    { key: "date", header: t("quot.col.date"), cell: (r) => date(r.transaction_date) },
    { key: "total", header: t("quot.col.total"), cell: (r) => money(r.grand_total) },
    { key: "status", header: t("quot.col.status"), cell: (r) => <Pill cls={quotPill(r.status)}>{r.status || t("pay.status.Draft")}</Pill> },
  ];

  return (
    <>
      <PageHead title={t("quot.title")} actions={<button className="btn" onClick={() => nav("/quotations/new")}>{t("quot.new")}</button>} />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("quot.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/quotations/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("quot.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
