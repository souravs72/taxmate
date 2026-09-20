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

const PAGE = 20;
type Row = { name: string; supplier_name?: string; tax_id?: string; supplier_group?: string; primary_address?: string };

export default function SupplierList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (q.trim()) f.push(["supplier_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>(DT.supplier, {
    fields: ["name", "supplier_name", "tax_id", "supplier_group", "primary_address"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const { total } = useFilteredCount(DT.supplier, filters as unknown as FilterTuple[]);
  const rows = list.data ?? [];

  const columns: Column<Row>[] = [
    { key: "name", header: t("cust.col.name"), className: "cust", cell: (s) => s.supplier_name || s.name },
    { key: "trn", header: t("cust.col.trn"), className: "mono", cell: (s) => s.tax_id || "—" },
    { key: "group", header: t("cust.col.group"), cell: (s) => s.supplier_group || "—" },
    { key: "city", header: t("cust.col.city"), className: "dt", cell: (s) => cityOf(s.primary_address) },
  ];

  return (
    <>
      <PageHead
        title={t("supp.title")}
        sub={t("supp.sub")}
        actions={
          <button type="button" className="btn" onClick={() => nav("/suppliers/new")}>＋ {t("supp.new")}</button>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("supp.search")} />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(s) => s.name}
          onOpen={(s) => nav(`/suppliers/${encodeURIComponent(s.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("supp.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}

function cityOf(addr?: string): string {
  if (!addr) return "—";
  const parts = addr.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return parts[1] || parts[0] || "—";
}
