import {useMemo, useCallback} from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useDocList } from "../../lib/resource";

import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useFilteredCount, useListParams, type FilterTuple } from "../../lib/list";
import { money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 20;
type Row = {
  name: string; item_name?: string; item_group?: string; is_stock_item?: number;
  is_zero_rated?: number; is_exempt?: number; standard_rate?: number; disabled?: number;
};

export default function ItemList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const status = get("status");

  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (status === "1") f.push(["disabled", "=", 1]);
    else if (status !== "all") f.push(["disabled", "=", 0]);
    if (q.trim()) f.push(["item_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q, status]);

  const list = useDocList<Row>(DT.item, {
    fields: ["name", "item_name", "item_group", "is_stock_item", "is_zero_rated", "is_exempt", "standard_rate", "disabled"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const { total } = useFilteredCount(DT.item, filters as unknown as FilterTuple[]);
  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.item,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, status, page],
  });

  const columns: Column<Row>[] = [
    { key: "code", header: t("item.col.code"), cell: (it) => (
      <span className="ordno">
        {it.name}
        {it.disabled ? <> <Pill cls="p-flat">{t("item.disabled")}</Pill></> : null}
      </span>
    ) },
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
        actions={<IfCanWrite><button className="btn" onClick={() => nav("/catalogue/items/new")}>{t("item.new")}</button></IfCanWrite>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("item.search")} />
          <SelectFilter
            label={t("item.disabled")}
            value={status === "1" || status === "all" ? status : ""}
            onChange={(v) => set("status", v)}
            allLabel={t("item.statusActive")}
            options={[
              { value: "1", label: t("item.disabled") },
              { value: "all", label: t("item.statusAll") },
            ]}
          />
        </FilterBar>

        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(it) => it.name}
          onOpen={(it) => nav(`/catalogue/items/${encodeURIComponent(it.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("item.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />

        <ListFooter shown={rows.length} total={total} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
