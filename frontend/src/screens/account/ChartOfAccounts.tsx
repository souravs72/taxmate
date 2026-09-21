import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";
import type { Filter } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { groupRow, useGroupedAggregate, useListParams, type FilterTuple } from "../../lib/list";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, ErrorBox, Legend, Loading, PageHead, Pill, StatTile } from "../../components/ui";
import { DataTable, type Column } from "../../components/DataTable";
import { FilterBar, SearchFilter } from "../../components/filters";

type TreeRow = {
  value: string;
  expandable?: number | boolean;
  root_type?: string;
  report_type?: string;
  account_currency?: string;
  parent?: string;
};

type Agg = { name?: string; count?: number };

function isGroup(row: TreeRow): boolean {
  return Boolean(Number(row.expandable));
}

function AccountBranch({
  company,
  parent,
  isRoot,
  depth,
  onOpen,
}: {
  company: string;
  parent?: string;
  isRoot?: boolean;
  depth: number;
  onOpen: (name: string) => void;
}) {
  const paused = !company || (!isRoot && !parent);
  const kids = useFrappeGetCall<{ message: TreeRow[] }>(
    METHOD.getAccountTree,
    { company, parent: isRoot ? undefined : parent },
    paused ? null : `acctree-${company}-${isRoot ? "root" : parent}`,
  );
  const rows = kids.data?.message ?? [];

  if (kids.isLoading) {
    return (
      <div style={{ padding: `${8 + depth * 4}px 12px` }}>
        <Loading />
      </div>
    );
  }
  if (kids.error) return <ErrorBox error={kids.error} onRetry={() => kids.mutate()} />;

  return (
    <ul className="acctree" style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {rows.map((row) => (
        <AccountNode key={row.value} company={company} row={row} depth={depth} onOpen={onOpen} />
      ))}
    </ul>
  );
}

function AccountNode({
  company,
  row,
  depth,
  onOpen,
}: {
  company: string;
  row: TreeRow;
  depth: number;
  onOpen: (name: string) => void;
}) {
  const group = isGroup(row);
  const [open, setOpen] = useState(false);

  return (
    <li>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          paddingInlineStart: 12 + depth * 16,
        }}
      >
        {group ? (
          <button
            type="button"
            className="btn quiet sm"
            aria-expanded={open}
            aria-label={t("coa.group")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span style={{ width: 28, textAlign: "center", color: "var(--muted)" }}>·</span>
        )}
        <button
          type="button"
          className="btn quiet"
          style={{ flex: 1, justifyContent: "flex-start", textAlign: "start" }}
          onClick={() => onOpen(row.value)}
        >
          <span className={group ? "" : "ordno"}>{row.value}</span>
        </button>
        {row.root_type && <Pill cls="p-flat">{row.root_type}</Pill>}
        {row.account_currency && (
          <span className="sub" style={{ margin: 0 }}>{row.account_currency}</span>
        )}
      </div>
      {group && open && (
        <AccountBranch company={company} parent={row.value} depth={depth + 1} onOpen={onOpen} />
      )}
    </li>
  );
}

export default function ChartOfAccounts() {
  const nav = useNavigate();
  const session = useSession();
  const { get, set } = useListParams(20);
  const q = get("q");
  const company = session.company;
  const paused = !session.user || !company;

  const baseFilters = useMemo(() => {
    const f: FilterTuple[] = [];
    if (company) f.push(["company", "=", company]);
    return f;
  }, [company]);

  const searchFilters = useMemo(() => {
    const f = [...baseFilters];
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f as unknown as Filter<{ name: string }>[];
  }, [baseFilters, q]);

  const leaves = useDocCount(
    DT.account,
    [...baseFilters, ["is_group", "=", 0]],
    undefined,
    paused ? null : undefined,
  );
  const groups = useDocCount(
    DT.account,
    [...baseFilters, ["is_group", "=", 1]],
    undefined,
    paused ? null : undefined,
  );
  const byRoot = useGroupedAggregate<Agg>(DT.account, {
    fields: [{ COUNT: "*", as: "count" }, "root_type as name"],
    filters: [...baseFilters, ["is_group", "=", 0]],
    groupBy: "root_type",
    enabled: !paused,
  });
  const hits = useDocList<{ name: string; root_type?: string; account_type?: string; is_group?: number; account_currency?: string }>(
    DT.account,
    {
      fields: ["name", "root_type", "account_type", "is_group", "account_currency"],
      filters: searchFilters,
      orderBy: { field: "name", order: "asc" },
      limit: 40,
    },
    paused || !q.trim() ? null : undefined,
  );

  const pick = groupRow<Agg>;
  const asset = Number(pick(byRoot.rows, "Asset")?.count) || 0;
  const liability = Number(pick(byRoot.rows, "Liability")?.count) || 0;
  const equity = Number(pick(byRoot.rows, "Equity")?.count) || 0;
  const income = Number(pick(byRoot.rows, "Income")?.count) || 0;
  const expense = Number(pick(byRoot.rows, "Expense")?.count) || 0;
  const donut = [
    { key: "Asset", label: t("coa.root.Asset"), n: asset, colour: "var(--brand)" },
    { key: "Liability", label: t("coa.root.Liability"), n: liability, colour: "var(--warn)" },
    { key: "Equity", label: t("coa.root.Equity"), n: equity, colour: "var(--c-confirmed)" },
    { key: "Income", label: t("coa.root.Income"), n: income, colour: "var(--c-billed)" },
    { key: "Expense", label: t("coa.root.Expense"), n: expense, colour: "var(--bad)" },
  ];
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const typeTotal = byRoot.rows.reduce((a, r) => a + (Number(r.count) || 0), 0);

  const columns: Column<{ name: string; root_type?: string; account_type?: string; is_group?: number }>[] = [
    { key: "name", header: t("coa.account"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "root", header: t("coa.root"), cell: (r) => r.root_type || "—" },
    { key: "type", header: t("coa.type"), cell: (r) => r.account_type || "—" },
    {
      key: "kind", header: t("coa.kind"),
      cell: (r) => <Pill cls={r.is_group ? "p-flat" : "p-done"}>{r.is_group ? t("coa.group") : t("coa.leaf")}</Pill>,
    },
  ];

  return (
    <>
      <PageHead title={t("coa.title")} />

      {byRoot.ready && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3 14.5V6l6-3.5 6 3.5v8.5"/><path d="M3 6l6 3.5L15 6"/>'
            label={t("coa.tile.leaves")} value={leaves.data ?? 0}
            foot={t("coa.tile.leavesFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3.5 2.5h11v13h-11z"/>'
            label={t("coa.tile.groups")} value={groups.data ?? 0}
            foot={t("coa.tile.groupsFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M3 15V8.5M7.5 15V3.5M12 15V10"/>'
            label={t("coa.root.Asset")} value={asset}
            foot={t("coa.tile.assetFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M3 15V8.5M12 15V10"/>'
            label={t("coa.root.Expense")} value={expense}
            foot={t("coa.tile.expenseFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("coa.chart.root")} bodyClass="donutwrap">
          {paused || byRoot.isLoading ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("coa.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {byRoot.ready && (
          <Card title={t("coa.chart.mix")} bodyClass="bars">
            {byRoot.rows.map((r) => (
              <BarRow
                key={String(r.name)}
                label={String(r.name || "—")}
                value={typeTotal ? (Number(r.count) / typeTotal) * 100 : 0}
                amount={Number(r.count) || 0}
                colour="var(--c-confirmed)"
              />
            ))}
          </Card>
        )}
      </div>

      <Card title={t("coa.tree")} bodyClass={null as unknown as string}>
        <FilterBar>
          <SearchFilter value={q} onChange={(v) => set("q", v)} placeholder={t("coa.search")} />
        </FilterBar>
        {q.trim() ? (
          <DataTable
            rows={hits.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/accounts/${encodeURIComponent(r.name)}`)}
            state={{ isLoading: paused || hits.isLoading, error: hits.error, onRetry: () => hits.mutate() }}
            emptyLabel={t("coa.empty")}
            columns={columns}
          />
        ) : paused || !company ? (
          <Loading />
        ) : (
          <AccountBranch
            company={company}
            isRoot
            depth={0}
            onOpen={(name) => nav(`/accounts/${encodeURIComponent(name)}`)}
          />
        )}
      </Card>
    </>
  );
}
