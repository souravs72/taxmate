import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Filter } from "frappe-react-sdk";
import { useFrappeGetDocCount, useFrappeGetDocList } from "frappe-react-sdk";

import { DT } from "../../lib/frappe";
import { date, money } from "../../lib/format";
import { EINVOICE_PILL, INV_PILL_CLASS, INV_UI_STATUSES, invoiceUiStatus, type InvUiStatus } from "../../lib/status";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import { useSession } from "../../lib/session";

const PAGE = 20;
type Row = {
  name: string; customer?: string; customer_name?: string; posting_date?: string;
  grand_total?: number; outstanding_amount?: number; status?: string; docstatus?: number;
  is_return?: number; uae_e_invoice_status?: string; vat_emirate?: string; po_no?: string;
};

export default function InvoiceList() {
  const nav = useNavigate();
  const session = useSession();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = (params.get("status") ?? "") as InvUiStatus | "";
  const einvoice = params.get("einvoice") ?? "";
  const emirate = params.get("emirate") ?? "";
  const page = Number(params.get("page") ?? "0") || 0;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };

  const filters = useMemo(() => {
    const f: Filter<Row>[] = [];
    if (status === "Draft") f.push(["docstatus", "=", 0]);
    else if (status === "Cancelled") f.push(["docstatus", "=", 2]);
    else if (status === "Return") f.push(["is_return", "=", 1]);
    else if (status === "Paid") f.push(["status", "=", "Paid"]);
    else if (status === "Part") f.push(["status", "=", "Partly Paid"]);
    else if (status === "Unpaid") f.push(["status", "in", ["Unpaid", "Overdue"]]);
    if (einvoice) f.push(["uae_e_invoice_status", "=", einvoice]);
    if (emirate) f.push(["vat_emirate", "=", emirate]);
    if (q.trim()) f.push(["name", "like", `%${q.trim()}%`]);
    return f;
  }, [q, status, einvoice, emirate]);

  const list = useFrappeGetDocList<Row>(DT.salesInvoice, {
    fields: ["name", "customer", "customer_name", "posting_date", "grand_total", "outstanding_amount",
      "status", "docstatus", "is_return", "uae_e_invoice_status", "vat_emirate", "po_no"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: PAGE,
    limit_start: page * PAGE,
  });
  const count = useFrappeGetDocCount(DT.salesInvoice, filters);
  const rows = list.data ?? [];
  const total = count.data ?? 0;

  return (
    <>
      <PageHead
        title={t("inv.title")}
        sub={t("inv.sub")}
        actions={<button className="btn" onClick={() => nav("/invoices/new")}>＋ {t("inv.new")}</button>}
      />
      <Card bodyClass={null as unknown as string}>
        <div className="filters">
          <div className="fsearch">
            <input className="ctl" type="search" value={q} placeholder={t("inv.search")}
              onChange={(e) => set("q", e.target.value)} />
          </div>
          <select className="ctl" value={status} onChange={(e) => set("status", e.target.value)}>
            <option value="">{t("filter.allStatuses")}</option>
            {INV_UI_STATUSES.map((s) => <option key={s} value={s}>{t(`inv.status.${s}`)}</option>)}
          </select>
          <select className="ctl" value={einvoice} onChange={(e) => set("einvoice", e.target.value)}>
            <option value="">{t("inv.allEinvoice")}</option>
            {["Draft", "Generated", "Queued", "Submitted", "Accepted", "Rejected", "Failed"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="ctl" value={emirate} onChange={(e) => set("emirate", e.target.value)}>
            <option value="">{t("inv.allEmirates")}</option>
            {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        {list.error ? <ErrorBox error={list.error} onRetry={() => list.mutate()} />
          : list.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("inv.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("inv.col.no")}</th>
                    <th>{t("so.col.customer")}</th>
                    <th>{t("inv.col.date")}</th>
                    <th className="n">{t("inv.col.total")}</th>
                    <th className="n">{t("inv.col.outstanding")}</th>
                    <th>{t("so.col.status")}</th>
                    <th>{t("inv.col.einvoice")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ui = invoiceUiStatus(r);
                    return (
                      <tr key={r.name} tabIndex={0}
                        onClick={() => nav(`/invoices/${encodeURIComponent(r.name)}`)}
                        onKeyDown={(e) => e.key === "Enter" && nav(`/invoices/${encodeURIComponent(r.name)}`)}>
                        <td><span className="ordno">{r.name}</span></td>
                        <td className="cust">{r.customer_name || r.customer}</td>
                        <td className="dt">{date(r.posting_date)}</td>
                        <td className="n tot">{money(r.grand_total)}</td>
                        <td className="n">{money(r.outstanding_amount)}</td>
                        <td><Pill cls={INV_PILL_CLASS[ui]}>{t(`inv.status.${ui}`)}</Pill></td>
                        <td>
                          {r.uae_e_invoice_status
                            ? <Pill cls={EINVOICE_PILL[r.uae_e_invoice_status] || "p-flat"}>{r.uae_e_invoice_status}</Pill>
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        <div className="foot">
          <span>{t("list.showing")} {rows.length} {t("list.of")} {total}{session.currency ? ` · ${session.currency}` : ""}</span>
          <div className="pager">
            <button disabled={page === 0} onClick={() => set("page", String(page - 1))}>‹</button>
            <button aria-current="true">{page + 1}</button>
            <button disabled={(page + 1) * PAGE >= total} onClick={() => set("page", String(page + 1))}>›</button>
          </div>
        </div>
      </Card>
    </>
  );
}
