/**
 * Loyalty Point Entry list (read-only).
 * Importers: App.tsx route /loyalty-point-entries.
 * API: taxmate.api.resource.get_list on Loyalty Point Entry.
 * Schema: name, customer, loyalty_program, loyalty_points, expiry_date, creation.
 * User: "Implement the plan… complete all the to-dos."
 */
import { useMemo } from "react";
import { useSession } from "../../lib/session";
import { useListParams } from "../../lib/list";
import { useDocCount, useDocList } from "../../lib/resource";
import { DT } from "../../lib/frappe";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 20;

type Row = {
  name: string;
  customer?: string;
  loyalty_program?: string;
  loyalty_points?: number;
  expiry_date?: string;
  creation?: string;
};

export default function LoyaltyPointEntryList() {
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["customer", "like", `%${q.trim()}%`]);
    if (session.company) f.push(["company", "=", session.company]);
    return f;
  }, [q, session.company]);

  const list = useDocList<Row>(DT.loyaltyPointEntry, {
    fields: ["name", "customer", "loyalty_program", "loyalty_points", "expiry_date", "creation"],
    filters: filters as never,
    orderBy: { field: "creation", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.loyaltyPointEntry, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "customer", header: t("lpe.col.customer"), cell: (r) => r.customer || "—" },
    { key: "program", header: t("lpe.col.program"), cell: (r) => r.loyalty_program || "—" },
    { key: "points", header: t("lpe.col.points"), cell: (r) => String(r.loyalty_points ?? 0) },
    { key: "expiry", header: t("lpe.col.expiry"), cell: (r) => date(r.expiry_date) },
    { key: "date", header: t("lpe.col.date"), cell: (r) => date(r.creation) },
  ];

  return (
    <>
      <PageHead title={t("lpe.title")} />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("lpe.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("lpe.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
