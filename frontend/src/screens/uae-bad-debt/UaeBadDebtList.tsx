import { useCallback } from "react";
/**
 * UaeBadDebtList — Phase 22. List UAE Bad Debt Relief records.
 * Callers: App.tsx /uae-bad-debt-relief
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { money } from "../../lib/format";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 30;
type Row = { name: string; company?: string; sales_invoice?: string; write_off_date?: string; vat_amount?: number; docstatus?: number };

export default function UaeBadDebtList() {
  const session = useSession();
  const nav = useNavigate();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const filters: [string, string, string][] = [];
  if (q.trim()) filters.push(["sales_invoice", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.uaeBadDebt, {
    fields: ["name", "company", "sales_invoice", "write_off_date", "vat_amount", "docstatus"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE, limit_start: start,
  });
  const count = useDocCount(DT.uaeBadDebt, filters as never);

  const columns: Column<Row>[] = [
    { key: "sales_invoice", header: t("ubd.col.invoice"), cell: (r) => r.sales_invoice ?? "" },
    { key: "write_off_date", header: t("ubd.col.writeOffDate"), cell: (r) => r.write_off_date ?? "" },
    { key: "vat_amount", header: t("ubd.col.vat"), className: "n", cell: (r) => money(r.vat_amount) },
  ];

  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.uaeBadDebt,
    onDone: refreshList,
    enabled: writable,
    clearDeps: [q, page],
  });

  return (
    <>
      <PageHead title={t("ubd.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/uae-bad-debt-relief/new")}>{t("ubd.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("ubd.col.invoice")} />
        </FilterBar>
        <BulkDraftBar drafts={draftDelete} />
        {list.isLoading ? <Loading /> : (
        <DataTable<Row>
            rows={rows}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/uae-bad-debt-relief/${encodeURIComponent(r.name)}`)}
            columns={columns}
            emptyLabel={t("ubd.empty")}
          selection={draftDelete.selection(rows)}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
