/**
 * Mode of Payment list.
 * Callers: App.tsx /modes-of-payment.
 * API: taxmate.api.resource.get_list on "Mode of Payment" (in _CORE_MASTERS → catalog).
 * Schema: { name, type, enabled }
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 30;

type Row = {
  name: string;
  type?: string;
  enabled?: number;
};

export default function ModeOfPaymentList() {
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string | number][] = q.trim()
    ? [["name", "like", `%${q.trim()}%`]]
    : [];

  const list = useDocList<Row>(DT.modeOfPayment, {
    fields: ["name", "type", "enabled"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.modeOfPayment, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("mop.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "type", header: t("mop.col.type"), cell: (r) => r.type || "—" },
    { key: "enabled", header: t("mop.col.enabled"), cell: (r) => r.enabled ? t("yes") : t("no") },
  ];

  return (
    <>
      <PageHead
        title={t("mop.title")}
        sub={t("mop.sub")}
        actions={
          writable ? (
            <button type="button" className="btn" onClick={() => nav("/modes-of-payment/new")}>
              {t("mop.new")}
            </button>
          ) : undefined
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("mop.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/modes-of-payment/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("mop.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
