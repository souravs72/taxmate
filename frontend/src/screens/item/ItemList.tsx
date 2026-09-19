import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappeGetDocCount, useFrappeGetDocList } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";

const PAGE = 20;
type Row = {
  name: string; item_name?: string; item_group?: string; is_stock_item?: number;
  is_zero_rated?: number; is_exempt?: number; standard_rate?: number;
};

export default function ItemList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const filters = useMemo(() => {
    const f: Filter<Row>[] = [["disabled", "=", 0]];
    if (q.trim()) f.push(["item_name", "like", `%${q.trim()}%`]);
    return f;
  }, [q]);

  const list = useFrappeGetDocList<Row>(DT.item, {
    fields: ["name", "item_name", "item_group", "is_stock_item", "is_zero_rated", "is_exempt", "standard_rate"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: page * PAGE,
  });
  const count = useFrappeGetDocCount(DT.item, filters);
  const rows = list.data ?? [];
  const total = count.data ?? 0;

  return (
    <>
      <PageHead
        title={t("item.title")}
        sub={t("item.sub")}
        actions={<button className="btn" onClick={() => nav("/catalogue/items/new")}>＋ {t("item.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <div className="filters">
          <div className="fsearch">
            <input className="ctl" type="search" value={q} placeholder={t("item.search")}
              onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
        </div>
        {list.error ? <ErrorBox error={list.error} onRetry={() => list.mutate()} />
          : list.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("item.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("item.col.code")}</th>
                    <th>{t("item.col.name")}</th>
                    <th>{t("item.col.group")}</th>
                    <th>{t("item.col.stock")}</th>
                    <th>{t("item.col.vat")}</th>
                    <th className="n">{t("item.col.rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((it) => (
                    <tr key={it.name} tabIndex={0}
                      onClick={() => nav(`/catalogue/items/${encodeURIComponent(it.name)}`)}
                      onKeyDown={(e) => e.key === "Enter" && nav(`/catalogue/items/${encodeURIComponent(it.name)}`)}>
                      <td><span className="ordno">{it.name}</span></td>
                      <td>{it.item_name}</td>
                      <td>{it.item_group}</td>
                      <td>{it.is_stock_item ? t("yes") : t("no")}</td>
                      <td>
                        {it.is_zero_rated ? <Pill cls="p-open">{t("item.zero")}</Pill>
                          : it.is_exempt ? <Pill cls="p-flat">{t("item.exempt")}</Pill>
                          : <Pill cls="p-done">{t("item.standard")}</Pill>}
                      </td>
                      <td className="n tot">{money(it.standard_rate)}</td>
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
