/**
 * Loyalty Program list screen.
 * Importers: App.tsx route /loyalty-programs.
 * API: taxmate.api.resource.get_list on Loyalty Program.
 * Schema: name, loyalty_program_type, company, from_date, to_date.
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
import { Card, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 20;

type Row = { name: string; loyalty_program_type?: string; company?: string; from_date?: string; to_date?: string };

export default function LoyaltyProgramList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const list = useDocList<Row>(DT.loyaltyProgram, {
    fields: ["name", "loyalty_program_type", "company", "from_date", "to_date"],
    filters: filters as never,
    orderBy: { field: "name", order: "asc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.loyaltyProgram, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "name", header: t("lp.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "type", header: t("lp.col.type"), cell: (r) => r.loyalty_program_type || "—" },
    { key: "company", header: t("lp.col.company"), cell: (r) => r.company || "—" },
    { key: "from", header: t("lp.col.from"), cell: (r) => date(r.from_date) },
    { key: "to", header: t("lp.col.to"), cell: (r) => date(r.to_date) },
  ];

  return (
    <>
      <PageHead
        title={t("lp.title")}
        actions={<button className="btn" onClick={() => nav("/loyalty-programs/new")}>{t("lp.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("lp.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/loyalty-programs/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("lp.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
