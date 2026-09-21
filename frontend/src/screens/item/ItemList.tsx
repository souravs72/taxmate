import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useDocList } from "../../lib/resource";

import { DT } from "../../lib/frappe";
import { useFilteredCount, useListParams, type FilterTuple } from "../../lib/list";
import { money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 20;
type Row = {
  name: string; item_name?: string; item_group?: string; is_stock_item?: number;
  is_zero_rated?: number; is_exempt?: number; standard_rate?: number;
};

export default function ItemList() {
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: FilterTuple[] = [["disabled", "=", 0]];
    if (q.trim()) f.push(["item_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>(DT.item, {
    fields: ["name", "item_name", "item_group", "is_stock_item", "is_zero_rated", "is_exempt", "standard_rate"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const { total } = useFilteredCount(DT.item, filters as unknown as FilterTuple[]);
  const rows = list.data ?? [];

  const columns: Column<Row>[] = [
    { key: "code", header: t("item.col.code"), cell: (it) => <span className="ordno">{it.name}</span> },
    { key: "name", header: t("item.col.name"), cell: (it) => it.item_name },
    { key: "group", header: t("item.col.group"), cell: (it) => it.item_group },
    { key: "stock", header: t("item.col.stock"), cell: (it) => (it.is_stock_item ? t("yes") : t("no")) },
    {
      key: "vat", header: t("item.col.vat"),
      cell: (it) => (
        it.is_zero_rated ? <Pill cls="p-open">{t("item.zero")}</Pill>
          : it.is_exempt ? <Pill cls="p-flat">{t("item.exempt")}</Pill>
          : <Pill cls="p-done">{t("item.standard")}</Pill>
      ),
    },
    { key: "rate", header: t("item.col.rate"), className: "n tot", cell: (it) => money(it.standard_rate) },
  ];

  return (
    <>
      <PageHead
        title={t("item.title")}
        sub={t("item.sub")}
        actions={<IfCanWrite><button className="btn" onClick={() => nav("/catalogue/items/new")}>＋ {t("item.new")}</button></IfCanWrite>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("item.search")} />
        </FilterBar>

        <DataTable<Row>
          rows={rows}
          rowKey={(it) => it.name}
          onOpen={(it) => nav(`/catalogue/items/${encodeURIComponent(it.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("item.empty")}
          columns={columns}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
