/**
 * Currency Exchange list screen.
 * Importers: App.tsx route /currency-exchanges.
 * API: taxmate.api.resource.get_list on Currency Exchange.
 * Schema: name, date, from_currency, to_currency, exchange_rate, for_buying, for_selling.
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

type Row = {
  name: string;
  date?: string;
  from_currency?: string;
  to_currency?: string;
  exchange_rate?: number;
  for_buying?: 0 | 1;
  for_selling?: 0 | 1;
};

export default function CurrencyExchangeList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const paused = !session.user;

  const filters = useMemo(() => {
    const f: [string, string, string][] = [];
    if (q.trim()) f.push(["from_currency", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const list = useDocList<Row>(DT.currencyExchange, {
    fields: ["name", "date", "from_currency", "to_currency", "exchange_rate", "for_buying", "for_selling"],
    filters: filters as never,
    orderBy: { field: "date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : undefined);

  const count = useDocCount(DT.currencyExchange, filters as never, undefined, paused ? null : undefined);

  const columns: Column<Row>[] = [
    { key: "date", header: t("cx.col.date"), cell: (r) => date(r.date) },
    { key: "from", header: t("cx.col.from"), cell: (r) => r.from_currency || "—" },
    { key: "to", header: t("cx.col.to"), cell: (r) => r.to_currency || "—" },
    { key: "rate", header: t("cx.col.rate"), cell: (r) => r.exchange_rate?.toFixed(6) ?? "—" },
    { key: "dir", header: t("cx.col.dir"), cell: (r) => [r.for_buying && "Buy", r.for_selling && "Sell"].filter(Boolean).join(" / ") || "—" },
  ];

  return (
    <>
      <PageHead
        title={t("cx.title")}
        actions={<button className="btn" onClick={() => nav("/currency-exchanges/new")}>{t("cx.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("cx.search")} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/currency-exchanges/${encodeURIComponent(r.name)}/edit`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("cx.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
