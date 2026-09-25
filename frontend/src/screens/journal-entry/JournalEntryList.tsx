import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { groupRow, useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter, SelectFilter } from "../../components/filters";

const PAGE = 20;
const TYPES = [
  "Journal Entry",
  "Bank Entry",
  "Cash Entry",
  "Credit Note",
  "Debit Note",
  "Contra Entry",
  "Write Off Entry",
  "Opening Entry",
  "Depreciation Entry",
] as const;

type Row = {
  name: string;
  posting_date?: string;
  voucher_type?: string;
  total_debit?: number;
  user_remark?: string;
  docstatus?: number;
  title?: string;
};

type Agg = { name?: string; count?: number; debit?: number };

function jePill(ds?: number): string {
  if (ds === 0) return "p-draft";
  if (ds === 2) return "p-cxl";
  return "p-done";
}

function jeStatus(ds?: number): string {
  if (ds === 0) return t("pay.status.Draft");
  if (ds === 2) return t("pay.status.Cancelled");
  return t("pay.status.Submitted");
}

export default function JournalEntryList() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const type = get("type");
  const status = get("status");
  const company = session.company;
  const paused = !session.user || !company;

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    if (type) f.push(["voucher_type", "=", type]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [company, type, q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status === "Draft") f.push(["docstatus", "=", 0]);
    else if (status === "Submitted") f.push(["docstatus", "=", 1]);
    else if (status === "Cancelled") f.push(["docstatus", "=", 2]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status]);

  const list = useDocList<Row>(
    DT.journalEntry,
    {
      fields: ["name", "posting_date", "voucher_type", "total_debit", "user_remark", "docstatus", "title"],
      filters,
      orderBy: { field: "modified", order: "desc" },
      limit: PAGE,
      limit_start: start,
    },
    paused ? null : undefined,
  );
  const count = useDocCount(DT.journalEntry, filters, undefined, paused ? null : undefined);
  const byStatus = useGroupedAggregate<Agg>(DT.journalEntry, {
    fields: [{ COUNT: "*", as: "count" }, { SUM: "total_debit", as: "debit" }, "docstatus as name"],
    filters: baseFilters,
    groupBy: "docstatus",
    enabled: !paused,
  });
  const byType = useGroupedAggregate<Agg>(DT.journalEntry, {
    fields: [{ COUNT: "*", as: "count" }, { SUM: "total_debit", as: "debit" }, "voucher_type as name"],
    filters: [...baseFilters, ["docstatus", "=", 1]],
    groupBy: "voucher_type",
    enabled: !paused,
  });

  const rows = list.data ?? [];
  const pick = groupRow<Agg>;
  const drafts = Number(pick(byStatus.rows, "0")?.count) || 0;
  const submitted = Number(pick(byStatus.rows, "1")?.count) || 0;
  const cancelled = Number(pick(byStatus.rows, "2")?.count) || 0;
  const posted = Number(pick(byStatus.rows, "1")?.debit) || 0;

  const donut = [
    { key: "0", label: t("pay.status.Draft"), n: drafts, colour: "var(--c-draft)" },
    { key: "1", label: t("pay.status.Submitted"), n: submitted, colour: "var(--c-billed)" },
    { key: "2", label: t("pay.status.Cancelled"), n: cancelled, colour: "var(--c-delivered)" },
  ];
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const typeRows = byType.rows.slice(0, 6);
  const typeTotal = typeRows.reduce((a, r) => a + (Number(r.debit) || 0), 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("je.col.no"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "date", header: t("inv.col.date"), className: "dt", cell: (r) => date(r.posting_date) },
    { key: "type", header: t("je.col.type"), cell: (r) => r.voucher_type || "—" },
    {
      key: "debit", header: t("je.col.debit"), className: "n tot",
      cell: (r) => money(r.total_debit),
    },
    { key: "remark", header: t("je.col.remark"), cell: (r) => r.user_remark || r.title || "—" },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={jePill(r.docstatus)}>{jeStatus(r.docstatus)}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        title={t("je.title")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/journals/new")}>
              {t("je.new")}
            </button>
          ) : null
        }
      />

      {byStatus.ready && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6"/>'
            label={t("je.tile.posted")} value={money(posted)} unit={cur}
            foot={`${submitted} ${t("je.tile.postedFoot")}`} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/>'
            label={t("je.tile.drafts")} value={drafts}
            foot={t("je.tile.draftsFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'
            label={t("je.tile.submitted")} value={submitted}
            foot={t("je.tile.submittedFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/>'
            label={t("je.tile.cancelled")} value={cancelled}
            foot={t("je.tile.cancelledFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("je.chart.status")} bodyClass="donutwrap">
          {paused || byStatus.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("je.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {byType.ready && (
          <Card title={t("je.chart.type")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(typeTotal)}</span>
            </div>
            {typeRows.map((r) => (
              <BarRow
                key={String(r.name)}
                label={String(r.name || "—")}
                currency={cur}
                value={typeTotal ? (Number(r.debit) / typeTotal) * 100 : 0}
                amount={Number(r.debit) || 0}
                colour="var(--c-confirmed)"
              />
            ))}
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("je.search")} />
          <SelectFilter
            value={type}
            onChange={(v) => set("type", v)}
            allLabel={t("je.allTypes")}
            options={TYPES.map((s) => ({ value: s, label: s }))}
          />
          <SelectFilter
            value={status}
            onChange={(v) => set("status", v)}
            allLabel={t("filter.allStatuses")}
            options={["Draft", "Submitted", "Cancelled"].map((s) => ({ value: s, label: t(`pay.status.${s}`) }))}
          />
        </FilterBar>
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(r.docstatus === 0
            ? `/journals/${encodeURIComponent(r.name)}/edit`
            : `/journals/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("je.empty")}
          columns={columns}
        />
        <ListFooter shown={rows.length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
