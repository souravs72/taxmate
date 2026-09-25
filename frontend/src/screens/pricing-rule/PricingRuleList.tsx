/**
 * Pricing Rule list. Route: /pricing-rules.
 * API: get_list on "Pricing Rule". Callers: App.tsx. Phase 9.
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

const PAGE = 30;
type Row = {
  name: string;
  title?: string;
  apply_on?: string;
  discount_percentage?: number;
  priority?: number;
  disable?: number;
  selling?: number;
  buying?: number;
};

export default function PricingRuleList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");

  const filters: [string, string, string][] = [];
  if (session.company) filters.push(["company", "=", session.company]);
  if (q.trim()) filters.push(["title", "like", `%${q.trim()}%`]);

  const list = useDocList<Row>(DT.pricingRule, {
    fields: ["name", "title", "apply_on", "discount_percentage", "priority", "disable", "selling", "buying"],
    filters: filters as never,
    orderBy: { field: "priority", order: "asc" },
    limit: PAGE,
    limit_start: start,
  });
  const count = useDocCount(DT.pricingRule, filters as never);

  const columns: Column<Row>[] = [
    { key: "name", header: t("prule.col.name"), cell: (r) => <span className="ordno">{r.title || r.name}</span> },
    { key: "apply_on", header: t("prule.col.applyOn"), cell: (r) => r.apply_on ?? "" },
    {
      key: "scope",
      header: t("prule.col.scope"),
      cell: (r) =>
        [r.selling ? t("prule.selling") : null, r.buying ? t("prule.buying") : null]
          .filter(Boolean)
          .join(" · ") || "—",
    },
    { key: "discount_percentage", header: t("prule.col.discount"), cell: (r) => r.discount_percentage != null ? `${r.discount_percentage}%` : "" },
    { key: "priority", header: t("prule.col.priority"), cell: (r) => String(r.priority ?? "") },
    { key: "disable", header: t("prule.col.active"), cell: (r) => r.disable ? t("prule.disabled") : t("prule.enabled") },
  ];

  return (
    <>
      <PageHead
        title={t("prule.title")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/pricing-rules/new")}>
              {t("prule.new")}
            </button>
          ) : null
        }
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("prule.search")} />
        </FilterBar>
        {list.isLoading ? (
          <Loading />
        ) : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/pricing-rules/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
            emptyLabel={t("prule.empty")}
            columns={columns}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
