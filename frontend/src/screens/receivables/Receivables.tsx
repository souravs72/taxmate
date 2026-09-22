import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { date, money, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead } from "../../components/ui";

type ReportRow = Record<string, unknown>;

export default function Receivables() {
  const nav = useNavigate();
  const session = useSession();
  const today = session.today || toIsoDate(new Date());
  const filters = useMemo(() => ({
    company: session.company,
    report_date: today,
    ageing_based_on: "Due Date",
    range1: 30,
    range2: 60,
    range3: 90,
    range4: 120,
  }), [session.company, today]);

  const report = useFrappeGetCall<{ message: { result?: ReportRow[]; columns?: { fieldname: string; label: string }[] } }>(
    METHOD.runReport,
    { report_name: "Accounts Receivable", filters },
    session.company ? ["Accounts Receivable", session.company, today] : null,
    { isPaused: () => !session.company },
  );

  const rows = (report.data?.message?.result ?? []).filter((r) => r && !r.bold && r.voucher_no);

  return (
    <>
      <PageHead title={t("ar.title")} />
      {report.error && <ErrorBox error={report.error} onRetry={() => report.mutate()} />}
      <Card bodyClass={null as unknown as string}>
        {report.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("ar.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("inv.col.no")}</th>
                    <th>{t("so.col.customer")}</th>
                    <th>{t("inv.col.date")}</th>
                    <th>{t("inv.due")}</th>
                    <th className="n">{t("inv.col.total")}</th>
                    <th className="n">{t("inv.col.outstanding")}</th>
                    <th className="n">{t("ar.age")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const voucher = String(r.voucher_no ?? r.voucher_no_link ?? "");
                    const open = voucher ? () => nav(`/invoices/${encodeURIComponent(voucher)}`) : undefined;
                    return (
                      <tr key={`${voucher}-${i}`} tabIndex={open ? 0 : undefined}
                        onClick={open}
                        onKeyDown={open ? (e) => { if (e.key === "Enter") open(); } : undefined}>
                        <td><span className="ordno">{voucher}</span></td>
                        <td className="cust">{String(r.party || r.customer_name || "")}</td>
                        <td className="dt">{date(String(r.posting_date || r.invoice_date || ""))}</td>
                        <td className="dt">{date(String(r.due_date || ""))}</td>
                        <td className="n tot">{money(Number(r.invoiced || r.invoice_amount || r.grand_total || 0))}</td>
                        <td className="n">{money(Number(r.outstanding || r.outstanding_amount || 0))}</td>
                        <td className="n">{String(r.age ?? r.ageing ?? "—")}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {voucher && (
                            <button type="button" className="btn ghost sm" onClick={() => nav(`/payments/new?invoice=${encodeURIComponent(voucher)}`)}>
                              {t("inv.receive")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
