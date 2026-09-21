/**
 * Importers: App.tsx /vat-201. Callers: rail, dashboard overdue tile, awesome search.
 * API: taxmate.api.resource.get_list / get_count / group_by_count on UAE VAT 201 Filing Log.
 * Schema: status Draft|Reviewed|Filed; deadline_status Upcoming|Due|Overdue|Filed; net_vat_due.
 * User: "Task 14: VAT 201 list + detail (then wire dashboard rows to it)"
 */
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
const STATUSES = ["Draft", "Reviewed", "Filed"] as const;
const DEADLINES = ["Upcoming", "Due", "Overdue", "Filed"] as const;
type FilingStatus = (typeof STATUSES)[number];
type Deadline = (typeof DEADLINES)[number];

const STATUS_COLOUR: Record<FilingStatus, string> = {
  Draft: "var(--warn)",
  Reviewed: "var(--brand)",
  Filed: "var(--c-billed)",
};

type Row = {
  name: string;
  period_start?: string;
  period_end?: string;
  filing_due_date?: string;
  status?: string;
  deadline_status?: string;
  net_vat_due?: number;
  tax_currency?: string;
};

type Agg = { name?: string; count?: number; amount?: number };

function statusPill(status?: string): string {
  if (status === "Filed") return "p-done";
  if (status === "Reviewed") return "p-open";
  return "p-draft";
}

function deadlinePill(status?: string): string {
  if (status === "Overdue") return "p-overdue";
  if (status === "Due") return "p-warn";
  if (status === "Filed") return "p-done";
  return "p-open";
}

export default function Vat201List() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set, page, setPage, start } = useListParams(PAGE);
  const q = get("q");
  const status = get("status") as FilingStatus | "";
  const deadline = get("deadline") as Deadline | "";
  const company = session.company;
  const paused = !session.user || !company;

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [["docstatus", "<", 2]];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);

  const orFilters = useMemo(() => {
    const text = q.trim();
    if (!text) return undefined;
    return [["name", "like", `%${text}%`]] as FilterTuple[];
  }, [q]);

  const filters = useMemo(() => {
    const f = [...baseFilters];
    if (status) f.push(["status", "=", status]);
    if (deadline) f.push(["deadline_status", "=", deadline]);
    return f as unknown as Filter<Row>[];
  }, [baseFilters, status, deadline]);

  const list = useDocList<Row>(
    DT.vat201,
    {
      fields: [
        "name", "period_start", "period_end", "filing_due_date",
        "status", "deadline_status", "net_vat_due", "tax_currency",
      ],
      filters,
      orFilters,
      orderBy: { field: "filing_due_date", order: "asc" },
      limit: PAGE,
      limit_start: start,
    },
    paused ? null : undefined,
  );
  const count = useDocCount(DT.vat201, filters, orFilters, paused ? null : undefined);
  const byStatus = useGroupedAggregate<Agg>(DT.vat201, {
    fields: [{ COUNT: "*", as: "count" }, { SUM: "net_vat_due", as: "amount" }, "status as name"],
    filters: baseFilters,
    groupBy: "status",
    enabled: !paused,
  });
  const byDeadline = useGroupedAggregate<Agg>(DT.vat201, {
    fields: [{ COUNT: "*", as: "count" }, "deadline_status as name"],
    filters: baseFilters,
    groupBy: "deadline_status",
    enabled: !paused,
  });

  const pick = groupRow<Agg>;
  const drafts = Number(pick(byStatus.rows, "Draft")?.count) || 0;
  const overdue = Number(pick(byDeadline.rows, "Overdue")?.count) || 0;
  const due = Number(pick(byDeadline.rows, "Due")?.count) || 0;
  const netDue = byStatus.rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const cur = session.currency || "";
  const donut = STATUSES.map((s) => ({
    key: s,
    label: t(`v201.status.${s}`),
    n: Number(pick(byStatus.rows, s)?.count) || 0,
    colour: STATUS_COLOUR[s],
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const deadlineTotal = byDeadline.rows.reduce((a, r) => a + (Number(r.count) || 0), 0);

  const columns: Column<Row>[] = [
    { key: "name", header: t("v201.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    {
      key: "period", header: t("v201.col.period"),
      cell: (r) => `${date(r.period_start)} – ${date(r.period_end)}`,
    },
    { key: "due", header: t("v201.col.due"), className: "dt", cell: (r) => date(r.filing_due_date) },
    {
      key: "net", header: t("v201.col.net"), className: "n tot",
      cell: (r) => (
        <>
          {r.tax_currency && r.tax_currency !== cur && <span className="cur">{r.tax_currency}</span>}
          {money(r.net_vat_due)}
        </>
      ),
    },
    {
      key: "status", header: t("so.col.status"),
      cell: (r) => <Pill cls={statusPill(r.status)}>{r.status ? t(`v201.status.${r.status}`) : "—"}</Pill>,
    },
    {
      key: "deadline", header: t("v201.col.deadline"),
      cell: (r) => <Pill cls={deadlinePill(r.deadline_status)}>{r.deadline_status || "—"}</Pill>,
    },
  ];

  return (
    <>
      <PageHead
        title={t("v201.title")}
        sub={t("v201.sub")}
        actions={
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav("/vat-201/new")}>
              ＋ {t("v201.new")}
            </button>
          ) : null
        }
      />
      {byStatus.ready && (
        <div className="tiles">
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M3.5 3.5h11v11h-11z"/><path d="M3.5 7h11"/>'
            label={t("v201.tile.overdue")} value={overdue} foot={t("v201.tile.overdueFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/>'
            label={t("v201.tile.drafts")} value={drafts} foot={t("v201.tile.draftsFoot")} />
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M9 2.5 16 15H2z"/>'
            label={t("v201.tile.due")} value={due} foot={t("v201.tile.dueFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'
            label={t("v201.tile.net")} value={money(netDue)} unit={cur}
            foot={t("v201.tile.netFoot")} />
        </div>
      )}
      <div className="charts">
        <Card title={t("v201.chart.status")} hint={t("v201.chart.statusHint")} bodyClass="donutwrap">
          {paused || byStatus.isLoading ? <Loading /> : (
            <><Donut data={donut} total={donutTotal} centreLabel={t("v201.chart.all")} /><Legend data={donut} /></>
          )}
        </Card>
        {byDeadline.ready && (
          <Card title={t("v201.chart.deadline")} hint={t("v201.chart.deadlineHint")} bodyClass="bars">
            {DEADLINES.map((d) => {
              const n = Number(pick(byDeadline.rows, d)?.count) || 0;
              return (
                <BarRow key={d} label={d} value={deadlineTotal ? (n / deadlineTotal) * 100 : 0}
                  amount={n} colour={d === "Overdue" ? "var(--bad)" : "var(--c-confirmed)"} />
              );
            })}
          </Card>
        )}
      </div>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("v201.search")} />
          <SelectFilter value={status} onChange={(v) => set("status", v)} allLabel={t("v201.allStatus")}
            options={STATUSES.map((s) => ({ value: s, label: t(`v201.status.${s}`) }))} />
          <SelectFilter value={deadline} onChange={(v) => set("deadline", v)} allLabel={t("v201.allDeadline")}
            options={DEADLINES.map((d) => ({ value: d, label: d }))} />
        </FilterBar>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/vat-201/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("v201.empty")}
          columns={columns}
        />
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
