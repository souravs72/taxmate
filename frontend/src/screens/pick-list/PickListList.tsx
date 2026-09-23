/**
 * Pick List list screen.
 * Importers: App.tsx route /pick-lists.
 * API: taxmate.api.resource.get_list on Pick List.
 * Schema: name, purpose (Select: Delivery/Material Transfer/Manufacture), customer, status, docstatus.
 * User: "Implement the plan… complete all the to-dos."
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;

type Row = {
  name: string;
  purpose?: string;
  customer?: string;
  status?: string;
  docstatus?: number;
  creation?: string;
};

function pillCls(status?: string): string {
  if (!status || status === "Open") return "p-open";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled") return "p-cxl";
  return "p-draft";
}

export default function PickListList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const purpose = get("purpose");
  const paused = !session.user;

  const baseFilters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (purpose) f.push(["purpose", "=", purpose]);
    return f;
  }, [baseFilters, purpose]);

  const list = useDocList<Row>(DT.pickList, {
    fields: ["name", "purpose", "customer", "status", "docstatus", "creation"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.pickList, filters as never, undefined, paused ? null : undefined);

  const purposes = [
    { value: "Delivery", label: t("picklist.purpose.delivery") },
    { value: "Material Transfer", label: t("picklist.purpose.transfer") },
    { value: "Manufacture", label: t("picklist.purpose.manufacture") },
  ];

  const columns: Column<Row>[] = [
    { key: "name", header: t("picklist.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "purpose", header: t("picklist.col.purpose"), cell: (r) => r.purpose || "—" },
    { key: "customer", header: t("picklist.col.customer"), cell: (r) => r.customer || "—" },
    { key: "status", header: t("picklist.col.status"), cell: (r) => <Pill cls={pillCls(r.status)}>{r.status || "Open"}</Pill> },
    { key: "creation", header: t("picklist.col.date"), cell: (r) => date(r.creation) },
  ];

  return (
    <>
      <PageHead
        title={t("picklist.title")}
        actions={<button className="btn" onClick={() => nav("/pick-lists/new")}>{t("picklist.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("picklist.search")} />
          <SelectFilter value={purpose} onChange={(v) => set("purpose", v)} allLabel={t("picklist.purpose")} options={purposes} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/pick-lists/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("picklist.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
