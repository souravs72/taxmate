import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappeGetCall, useFrappeGetDocCount, useFrappeGetDocList } from "frappe-react-sdk";

import type { SalesOrder } from "../../types/erpnext";
import { METHOD, DT } from "../../lib/frappe";
import { date, money, pct } from "../../lib/format";
import {
  SO_PILL_CLASS, STAGE_COLOUR, erpStatusesFor, isLate, toUiStatus,
  type SoUiStatus, type Stage,
} from "../../lib/status";
import { t } from "../../i18n/strings";
import {
  BarRow, Card, Donut, Empty, ErrorBox, Legend, Loading, MiniBar, PageHead, Pill, StatTile,
} from "../../components/ui";

const PAGE = 20;

/** Only what the list needs — a Sales Order carries 170 fields. */
const FIELDS = [
  "name", "customer", "customer_name", "transaction_date", "delivery_date",
  "grand_total", "currency", "status", "docstatus", "per_delivered", "per_billed",
] as const;

type Row = Pick<SalesOrder, (typeof FIELDS)[number]>;

type GroupCount = { name: string; count: number };

export default function SalesOrderList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState("");
  const [uiStatus, setUiStatus] = useState<"" | SoUiStatus>("");
  const [page, setPage] = useState(0);

  /* Server-side filters. Status filters expand to the ERPNext values —
     see lib/status.ts for why the mapping is client-side.               */
  const filters = useMemo(() => {
    const f: Filter<Row>[] = [];
    if (customer) f.push(["customer", "=", customer]);
    if (uiStatus) f.push(["status", "in", erpStatusesFor(uiStatus)]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [customer, uiStatus, q]);

  const list = useFrappeGetDocList<Row>(DT.salesOrder, {
    fields: [...FIELDS],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: page * PAGE,
  });

  const count = useFrappeGetDocCount(DT.salesOrder, filters as unknown as Parameters<typeof useFrappeGetDocCount>[1]);

  /* Donut — counts per ERPNext status, folded into the four stages client-side.
     frappe.desk.listview.get_group_by_count returns [{name, count}].        */
  const grouped = useFrappeGetCall<{ message: GroupCount[] }>(METHOD.groupByCount, {
    doctype: DT.salesOrder,
    current_filters: JSON.stringify(filters),
    field: "status",
  });

  /* The one endpoint that needs backend work. Until it exists the bars and
     two tiles stay hidden rather than showing invented numbers.            */
  const summary = useFrappeGetCall<{
    message: {
      committed: number; delivered_value: number; billed_value: number;
      unbilled_delivered: number; open_count: number; overdue_count: number;
    };
  }>(METHOD.fulfilmentSummary, {}, undefined, { shouldRetryOnError: false });

  const s = summary.data?.message;
  const rows = list.data ?? [];

  const stages = useMemo(() => {
    const counts: Record<Stage, number> = { draft: 0, confirmed: 0, delivered: 0, billed: 0 };
    for (const g of grouped.data?.message ?? []) {
      const ui = toUiStatus(g.name);
      if (ui === "Draft") counts.draft += g.count;
      else if (ui === "Completed") counts.billed += g.count;
      else if (ui !== "Cancelled") counts.confirmed += g.count;
    }
    return ([
      { key: "draft", label: t("stage.draft"), n: counts.draft, colour: STAGE_COLOUR.draft },
      { key: "confirmed", label: t("stage.confirmed"), n: counts.confirmed, colour: STAGE_COLOUR.confirmed },
      { key: "delivered", label: t("stage.delivered"), n: counts.delivered, colour: STAGE_COLOUR.delivered },
      { key: "billed", label: t("stage.billed"), n: counts.billed, colour: STAGE_COLOUR.billed },
    ]);
  }, [grouped.data]);

  const stageTotal = stages.reduce((a, b) => a + b.n, 0);
  const total = count.data ?? 0;

  return (
    <>
      <PageHead
        title={t("so.title")}
        sub={t("so.sub")}
        actions={
          <>
            <button className="btn ghost">{t("so.export")}</button>
            <button className="btn" onClick={() => nav("/orders/new")}>＋ {t("so.new")}</button>
          </>
        }
      />

      {s && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6"/>'
            label={t("so.tile.open")} value={s.open_count}
            foot={`AED ${money(s.committed)} ${t("so.tile.openFoot")}`} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/><circle cx="12.4" cy="10" r="1"/>'
            label={t("so.tile.committed")} value={money(s.committed)} unit="AED"
            foot={t("so.tile.committedFoot")} />
          <StatTile colour="var(--c-delivered)" tint="rgba(8,145,178,.13)"
            icon='<path d="M2 6h8v6H2zM10 8h2.5L15.5 10.5v1.5H10z"/><circle cx="4.5" cy="13.5" r="1.3"/>'
            label={t("so.tile.unbilled")} value={money(s.unbilled_delivered)} unit="AED"
            foot={t("so.tile.unbilledFoot")} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("so.tile.late")} value={s.overdue_count} foot={t("so.tile.lateFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("so.chart.stage")} hint={t("so.chart.stageHint")} bodyClass="donutwrap">
          {grouped.isLoading ? <Loading /> : (
            <>
              <Donut data={stages} total={stageTotal} centreLabel={t("so.chart.all")} />
              <Legend data={stages} />
            </>
          )}
        </Card>

        {s && (
          <Card title={t("so.chart.fulfil")} hint={t("so.chart.fulfilHint")} bodyClass="bars">
            <div className="hero">
              <span className="c">AED</span>
              <span className="n2">{money(s.committed)}</span>
            </div>
            <BarRow label={t("so.bar.delivered")}
              value={s.committed ? (s.delivered_value / s.committed) * 100 : 0}
              amount={s.delivered_value} colour="var(--c-delivered)" />
            <BarRow label={t("so.bar.billed")}
              value={s.committed ? (s.billed_value / s.committed) * 100 : 0}
              amount={s.billed_value} colour="var(--c-billed)" />
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        <div className="filters">
          <div className="fsearch">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
            </svg>
            <input className="ctl" type="search" value={q} placeholder={t("so.col.no")}
              onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          <CustomerFilter value={customer} onChange={(v) => { setCustomer(v); setPage(0); }} />
          <select className="ctl" value={uiStatus}
            onChange={(e) => { setUiStatus(e.target.value as SoUiStatus | ""); setPage(0); }}>
            <option value="">{t("filter.allStatuses")}</option>
            {(["Draft", "Open", "Completed", "Cancelled"] as SoUiStatus[]).map((st) => (
              <option key={st} value={st}>{t(`status.${st}`)}</option>
            ))}
          </select>
        </div>

        {list.error ? <ErrorBox error={list.error} onRetry={() => list.mutate()} />
          : list.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("list.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("so.col.no")}</th>
                    <th>{t("so.col.customer")}</th>
                    <th>{t("so.col.orderDate")}</th>
                    <th>{t("so.col.deliveryDate")}</th>
                    <th className="n">{t("so.col.total")}</th>
                    <th>
                      {t("so.col.fulfilment")}
                      <span className="thlegend">
                        <span><i style={{ background: "var(--c-delivered)" }} />{t("so.bar.delivered")}</span>
                        <span><i style={{ background: "var(--c-billed)" }} />{t("so.bar.billed")}</span>
                      </span>
                    </th>
                    <th>{t("so.col.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => {
                    const late = isLate(o);
                    const ui = toUiStatus(o.status);
                    return (
                      <tr key={o.name} tabIndex={0} onClick={() => nav(`/orders/${encodeURIComponent(o.name)}`)}
                          onKeyDown={(e) => e.key === "Enter" && nav(`/orders/${encodeURIComponent(o.name)}`)}>
                        <td><span className="ordno">{o.name}</span></td>
                        <td className="cust">{o.customer_name || o.customer}</td>
                        <td className="dt">{date(o.transaction_date)}</td>
                        <td className={`dt${late ? " late" : ""}`}>
                          {date(o.delivery_date)}
                          {late && <span className="latetag"> {t("so.late")}</span>}
                        </td>
                        <td className="n tot">{money(o.grand_total)}</td>
                        <td>
                          <div className="ful">
                            <div className="fl">
                              <MiniBar value={o.per_delivered ?? 0} colour={late ? "var(--bad)" : "var(--c-delivered)"} />
                              <span className="fpc">{pct(o.per_delivered)}</span>
                            </div>
                            <div className="fl">
                              <MiniBar value={o.per_billed ?? 0} colour="var(--c-billed)" />
                              <span className="fpc">{pct(o.per_billed)}</span>
                            </div>
                          </div>
                        </td>
                        <td><Pill cls={SO_PILL_CLASS[ui]}>{t(`status.${ui}`)}</Pill></td>
                        <td>
                          <svg className="chev" width="14" height="14" viewBox="0 0 16 16" fill="none"
                               stroke="currentColor" strokeWidth="1.8"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        <div className="foot">
          <span>{t("list.showing")} {rows.length} {t("list.of")} {total} {t("list.orders")}</span>
          <div className="pager">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
            <button aria-current="true">{page + 1}</button>
            <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
        </div>
      </Card>
    </>
  );
}

function CustomerFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useFrappeGetDocList<{ name: string; customer_name: string }>(DT.customer, {
    fields: ["name", "customer_name"],
    orderBy: { field: "customer_name", order: "asc" },
    limit: 500,
  });
  return (
    <select className="ctl" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("filter.allCustomers")}</option>
      {(data ?? []).map((c) => (
        <option key={c.name} value={c.name}>{c.customer_name || c.name}</option>
      ))}
    </select>
  );
}
