import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useDocList } from "../../lib/resource";

import { DT } from "../../lib/frappe";
import { useFilteredCount, useListParams, type FilterTuple } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 20;
type Row = { name: string; customer_name?: string; tax_id?: string; customer_group?: string; primary_address?: string };

export default function CustomerList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (q.trim()) f.push(["customer_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>(DT.customer, {
    fields: ["name", "customer_name", "tax_id", "customer_group", "primary_address"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const { total } = useFilteredCount(DT.customer, filters as unknown as FilterTuple[]);
  const rows = list.data ?? [];

  const columns: Column<Row>[] = [
    { key: "name", header: t("cust.col.name"), className: "cust", cell: (c) => c.customer_name || c.name },
    { key: "trn", header: t("cust.col.trn"), className: "mono", cell: (c) => c.tax_id || "—" },
    { key: "group", header: t("cust.col.group"), cell: (c) => c.customer_group || "—" },
    { key: "city", header: t("cust.col.city"), className: "dt", cell: (c) => cityOf(c.primary_address) },
  ];

  return (
    <>
      <PageHead
        title={t("cust.title")}
        actions={<IfCanWrite><button className="btn" onClick={() => nav("/customers/new")}>{t("cust.new")}</button></IfCanWrite>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("cust.search")} />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(c) => c.name}
          onOpen={(c) => nav(`/customers/${encodeURIComponent(c.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("cust.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}

/** Addresses arrive as one formatted string; the second line is the city. */
function cityOf(addr?: string): string {
  if (!addr) return "—";
  const parts = addr.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return parts[1] || parts[0] || "—";
}
