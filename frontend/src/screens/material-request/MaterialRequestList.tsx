/**
 * Material Request list.
 * Importers: App.tsx. API: taxmate.api.resource.get_list on Material Request.
 * Schema: name, material_request_type, transaction_date, status, docstatus.
 * User: "Implement the plan as specified… complete all the to-dos."
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

type Row = { name: string; material_request_type?: string; transaction_date?: string; status?: string; docstatus?: number; };

function mrPill(status?: string): string {
  if (status === "Cancelled" || status === "Stopped") return "p-cxl";
  if (status === "Ordered" || status === "Transferred" || status === "Issued") return "p-done";
  if (status === "Pending") return "p-open";
  return "p-draft";
}

export default function MaterialRequestList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const mrType = get("type");
  const paused = !session.user;

  const baseFilters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (mrType) f.push(["material_request_type", "=", mrType]);
    return f;
  }, [baseFilters, mrType]);

  const list = useDocList<Row>(DT.materialRequest, {
    fields: ["name", "material_request_type", "transaction_date", "status", "docstatus"],
    filters: filters as never,
    orderBy: { field: "transaction_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.materialRequest, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("mr.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "type", header: t("mr.col.purpose"), cell: (r) => r.material_request_type || "—" },
    { key: "date", header: t("mr.col.date"), cell: (r) => date(r.transaction_date) },
    { key: "status", header: t("mr.col.status"), cell: (r) => <Pill cls={mrPill(r.status)}>{r.status || t("pay.status.Draft")}</Pill> },
  ];

  const types = [
    { value: "Purchase", label: t("mr.purpose.purchase") },
    { value: "Material Transfer", label: t("mr.purpose.transfer") },
    { value: "Material Issue", label: t("mr.purpose.issue") },
    { value: "Manufacture", label: t("mr.purpose.manufacture") },
  ];

  return (
    <>
      <PageHead title={t("mr.title")} actions={<button className="btn" onClick={() => nav("/material-requests/new")}>{t("mr.new")}</button>} />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("mr.search")} />
          <SelectFilter value={mrType} onChange={(v) => set("type", v)} allLabel={t("mr.purpose")} options={types} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/material-requests/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("mr.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
