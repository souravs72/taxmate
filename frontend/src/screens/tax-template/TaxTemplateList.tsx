import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
type Kind = "sales" | "purchase";
type Row = { name: string; title?: string; company?: string; is_default?: number; disabled?: number };
type Agg = { name?: string; count?: number };

function doctypeFor(kind: Kind): string {
  return kind === "purchase" ? DT.purchaseTaxTemplate : DT.taxTemplate;
}

export default function TaxTemplateList() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const kind = (get("kind") === "purchase" ? "purchase" : "sales") as Kind;
  const company = session.company;
  const paused = !session.user || !company;
  const dt = doctypeFor(kind);

  const filters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    if (q.trim()) f.push(["title", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<Row>[];
  }, [company, q]);

  const list = useDocList<Row>(dt, {
    fields: ["name", "title", "company", "is_default", "disabled"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: start,
  }, paused ? null : `tax-${dt}`);
  const count = useDocCount(dt, filters, undefined, paused ? null : `taxc-${dt}`);
  const salesN = useDocCount(DT.taxTemplate, company ? [["company", "=", company]] : [], undefined, paused ? null : undefined);
  const purchaseN = useDocCount(DT.purchaseTaxTemplate, company ? [["company", "=", company]] : [], undefined, paused ? null : undefined);
  const byDefault = useGroupedAggregate<Agg>(dt, {
    fields: [{ COUNT: "*", as: "count" }, "is_default as name"],
    filters: company ? [["company", "=", company]] : [],
    groupBy: "is_default",
    enabled: !paused,
  });

  const donut = [
    { key: "sales", label: t("tx.sales"), n: salesN.data ?? 0, colour: "var(--brand)" },
    { key: "purchase", label: t("tx.purchase"), n: purchaseN.data ?? 0, colour: "var(--c-confirmed)" },
  ];
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const kindTotal = kind === "purchase" ? (purchaseN.data || 1) : (salesN.data || 1);

  const columns: Column<Row>[] = [
    { key: "name", header: t("tx.col.name"), cell: (r) => <span className="ordno">{r.title || r.name}</span> },
    { key: "company", header: t("coa.company"), cell: (r) => r.company || "—" },
    {
      key: "def", header: t("tx.col.default"),
      cell: (r) => r.is_default ? <Pill cls="p-done">{t("yes")}</Pill> : <Pill cls="p-flat">{t("no")}</Pill>,
    },
  ];

  return (
    <>
      <PageHead title={t("tx.title")} />
      <div className="tiles">
        <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
          icon='<path d="M3.5 2.5h8l3 3v10h-11z"/>'
          label={t("tx.sales")} value={paused ? "—" : (salesN.data ?? 0)} foot={t("tx.tile.salesFoot")} />
        <StatTile colour="var(--c-confirmed)" tint="rgba(72,127,255,.10)"
          icon='<path d="M3.5 2.5h11v13h-11z"/>'
          label={t("tx.purchase")} value={paused ? "—" : (purchaseN.data ?? 0)} foot={t("tx.tile.purchaseFoot")} />
      </div>
      <div className="charts">
        <Card title={t("tx.chart.kind")} bodyClass="donutwrap">
          {paused ? <Loading /> : <><Donut data={donut} total={donutTotal} centreLabel={t("tx.chart.all")} /><Legend data={donut} /></>}
        </Card>
        {byDefault.ready && (
          <Card title={t("tx.chart.default")} bodyClass="bars">
            {byDefault.rows.map((r) => (
              <BarRow key={String(r.name)} label={String(r.name) === "1" ? t("tx.col.default") : t("tx.other")}
                value={(Number(r.count) / kindTotal) * 100}
                amount={Number(r.count) || 0} colour="var(--c-billed)" />
            ))}
          </Card>
        )}
      </div>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("tx.search")} />
          <SelectFilter value={kind} onChange={(v) => set("kind", v === "purchase" ? "purchase" : "sales")}
            allLabel={t("tx.sales")}
            options={[{ value: "sales", label: t("tx.sales") }, { value: "purchase", label: t("tx.purchase") }]} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/tax-templates/${kind}/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("tx.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
