/**
 * Landed Cost Voucher list. Route: /landed-cost-vouchers.
 * API: taxmate.api.resource.get_list on "Landed Cost Voucher".
 * Callers: App.tsx. Phase 8.
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { money } from "../../lib/format";
import { Card, Loading, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 30;
/** LCV has no grand_total; charges roll up on total_taxes_and_charges. */
type Row = {
  name: string;
  posting_date?: string;
  total_taxes_and_charges?: number;
  docstatus?: number;
};

export default function LandedCostVoucherList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = [];
  if (session.company) filters.push(["company", "=", session.company]);
  if (q.trim()) filters.push(["name", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.landedCostVoucher, {
    fields: ["name", "posting_date", "total_taxes_and_charges", "docstatus"],
    filters: filters as never,
    orderBy: { field: "posting_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.landedCostVoucher, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("lcv.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "posting_date", header: t("lcv.col.date"), cell: (r) => r.posting_date ?? "" },
    {
      key: "total",
      header: t("lcv.col.total"),
      cell: (r) => money(r.total_taxes_and_charges),
    },
    { key: "docstatus", header: t("lcv.col.status"), cell: (r) => {
      const cls = r.docstatus === 1 ? "p-submitted" : r.docstatus === 2 ? "p-cancelled" : "p-draft";
      const lbl = r.docstatus === 1 ? "Submitted" : r.docstatus === 2 ? "Cancelled" : "Draft";
      return <Pill cls={cls}>{lbl}</Pill>;
    }},
  ];

  return (
    <>
      <PageHead
        title={t("lcv.title")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/landed-cost-vouchers/new")}>
              {t("lcv.new")}
            </button>
          ) : null
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("lcv.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/landed-cost-vouchers/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("lcv.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
