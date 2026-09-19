import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappeGetDocCount, useFrappeGetDocList } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead } from "../../components/ui";

const PAGE = 20;
type Row = { name: string; customer_name?: string; tax_id?: string; customer_group?: string; primary_address?: string };

export default function CustomerList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filters = useMemo(() => {
    const f: Filter<Row>[] = [];
    if (q.trim()) f.push(["customer_name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const list = useFrappeGetDocList<Row>(DT.customer, {
    fields: ["name", "customer_name", "tax_id", "customer_group", "primary_address"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: page * PAGE,
  });
  const count = useFrappeGetDocCount(DT.customer, filters);
  const rows = list.data ?? [];
  const total = count.data ?? 0;

  return (
    <>
      <PageHead
        title={t("cust.title")}
        sub={t("cust.sub")}
        actions={<button className="btn" onClick={() => nav("/customers/new")}>＋ {t("cust.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <div className="filters">
          <div className="fsearch">
            <input className="ctl" type="search" value={q} placeholder={t("cust.search")}
              onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
        </div>
        {list.error ? <ErrorBox error={list.error} onRetry={() => list.mutate()} />
          : list.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("cust.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("cust.col.name")}</th>
                    <th>{t("cust.col.trn")}</th>
                    <th>{t("cust.col.group")}</th>
                    <th>{t("cust.col.city")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.name} tabIndex={0}
                      onClick={() => nav(`/customers/${encodeURIComponent(c.name)}`)}
                      onKeyDown={(e) => e.key === "Enter" && nav(`/customers/${encodeURIComponent(c.name)}`)}>
                      <td className="cust">{c.customer_name || c.name}</td>
                      <td className="mono">{c.tax_id || "—"}</td>
                      <td>{c.customer_group || "—"}</td>
                      <td className="dt">{cityOf(c.primary_address)}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <div className="foot">
          <span>{t("list.showing")} {rows.length} {t("list.of")} {total}</span>
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

function cityOf(addr?: string): string {
  if (!addr) return "—";
  const parts = addr.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  return parts[1] || parts[0] || "—";
}
