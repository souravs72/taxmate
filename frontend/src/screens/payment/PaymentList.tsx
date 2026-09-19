import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappeGetDocCount, useFrappeGetDocList } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";

const PAGE = 20;
type Row = {
  name: string; party?: string; posting_date?: string; paid_amount?: number;
  docstatus?: number; status?: string; payment_type?: string;
};

export default function PaymentList() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const type = params.get("type") || "Receive";

  const filters = useMemo(() => {
    const f: Filter<Row>[] = [["payment_type", "=", type]];
    if (q.trim()) f.push(["party", "like", `%${q.trim()}%`]);
    return f;
  }, [q, type]);

  const list = useFrappeGetDocList<Row>(DT.paymentEntry, {
    fields: ["name", "party", "posting_date", "paid_amount", "docstatus", "status", "payment_type"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: page * PAGE,
  });
  const count = useFrappeGetDocCount(DT.paymentEntry, filters);
  const rows = list.data ?? [];
  const total = count.data ?? 0;

  return (
    <>
      <PageHead
        title={t("pay.title")}
        sub={t("pay.sub")}
        actions={<button className="btn" onClick={() => nav("/payments/new")}>＋ {t("pay.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <div className="filters">
          <div className="fsearch">
            <input className="ctl" type="search" value={q} placeholder={t("pay.search")}
              onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
        </div>
        {list.error ? <ErrorBox error={list.error} onRetry={() => list.mutate()} />
          : list.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("pay.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("pay.col.no")}</th>
                    <th>{t("pay.col.party")}</th>
                    <th>{t("inv.col.date")}</th>
                    <th className="n">{t("pay.col.amount")}</th>
                    <th>{t("so.col.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} tabIndex={0}
                      onClick={() => nav(`/payments/${encodeURIComponent(r.name)}`)}
                      onKeyDown={(e) => e.key === "Enter" && nav(`/payments/${encodeURIComponent(r.name)}`)}>
                      <td><span className="ordno">{r.name}</span></td>
                      <td>{r.party}</td>
                      <td className="dt">{date(r.posting_date)}</td>
                      <td className="n tot">{money(r.paid_amount)}</td>
                      <td>
                        <Pill cls={r.docstatus === 1 ? "p-done" : r.docstatus === 2 ? "p-cxl" : "p-draft"}>
                          {r.docstatus === 1 ? t("inv.status.Paid") : r.docstatus === 2 ? t("inv.status.Cancelled") : t("inv.status.Draft")}
                        </Pill>
                      </td>
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
