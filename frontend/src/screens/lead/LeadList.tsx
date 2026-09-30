/**
 * LeadList — Phase 21. CRM Leads.
 * Callers: App.tsx /leads; nav under Sales
 * API: taxmate.api.resource.get_list on "Lead"
 */
import {useMemo, useCallback} from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useDocList, useDocCount } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 25;
type Row = { name: string; lead_name?: string; company_name?: string; status?: string; lead_owner?: string; creation?: string };

function leadPill(status?: string): string {
  if (status === "Converted") return "p-done";
  if (status === "Do Not Contact" || status === "Lost Quotation") return "p-cxl";
  if (status === "Open" || status === "Replied") return "p-open";
  return "p-flat";
}

export default function LeadList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["lead_name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [q]);

  const list = useDocList<Row>(DT.lead, {
    fields: ["name", "lead_name", "company_name", "status", "lead_owner", "creation"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.lead, filters);

  const columns: Column<Row>[] = [
    { key: "name", header: t("lead.col.name"), cell: (r) => <span className="ordno">{r.lead_name || r.name}</span> },
    { key: "company", header: t("lead.col.company"), cell: (r) => r.company_name || "—" },
    { key: "date", header: t("lead.col.date"), cell: (r) => date(r.creation) },
    { key: "status", header: t("lead.col.status"), cell: (r) => <Pill cls={leadPill(r.status)}>{r.status || "Open"}</Pill> },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.lead,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
    clearDeps: [q, page],
  });

  return (
    <>
      <PageHead title={t("lead.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/leads/new")}>{t("lead.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("lead.search")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />

        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/leads/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("lead.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
