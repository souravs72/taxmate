/**
 * PeriodClosingList — Phase 5.
 * Minimal SPA for Period Closing Vouchers (submittable).
 * Callers: App.tsx /period-closing
 * API: taxmate.api.resource.get_list on "Period Closing Voucher"
 *
 * NOTE: JE and PE are NOT VAT-period-locked — invoice-only lock.
 * Period Closing Voucher is a books administrative close unrelated to UAE VAT periods.
 */
import { useNavigate } from "react-router-dom";

import { useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, Empty, ErrorBox, Loading, PageHead, Pill } from "../../components/ui";

type Row = {
  name: string;
  transaction_date?: string;
  period_start_date?: string;
  period_end_date?: string;
  fiscal_year?: string;
  closing_account_head?: string;
  docstatus?: number;
};

export default function PeriodClosingList() {
  const nav = useNavigate();
  const session = useSession();
  const company = session.company || "";

  const list = useDocList<Row>("Period Closing Voucher", {
    // net_total_profit is not a parent field on Period Closing Voucher.
    fields: [
      "name",
      "transaction_date",
      "period_start_date",
      "period_end_date",
      "fiscal_year",
      "closing_account_head",
      "docstatus",
    ],
    filters: company ? [["company", "=", company]] : [],
    orderBy: { field: "transaction_date", order: "desc" },
    limit: 50,
  });

  return (
    <>
      <PageHead title={t("pcv.title")} />
      {list.error && <ErrorBox error={list.error} onRetry={() => list.mutate()} />}
      <Card bodyClass={null as unknown as string}>
        {list.isLoading ? (
          <Loading />
        ) : (list.data ?? []).length === 0 ? (
          <Empty label={t("pcv.empty")} />
        ) : (
          <div className="twrap">
            <table className="clickable">
              <thead>
                <tr>
                  <th>{t("pcv.col.name")}</th>
                  <th>{t("pcv.col.date")}</th>
                  <th>{t("pcv.col.period")}</th>
                  <th>{t("pcv.col.account")}</th>
                  <th>{t("inv.col.status")}</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((r) => (
                  <tr
                    key={r.name}
                    onClick={() => nav(`/period-closing/${encodeURIComponent(r.name)}`)}
                  >
                    <td>
                      <span className="ordno">{r.name}</span>
                    </td>
                    <td className="dt">{date(r.transaction_date)}</td>
                    <td>
                      {r.period_start_date && r.period_end_date
                        ? `${date(r.period_start_date)} – ${date(r.period_end_date)}`
                        : r.fiscal_year || "—"}
                    </td>
                    <td>{r.closing_account_head || "—"}</td>
                    <td>
                      <Pill
                        cls={
                          r.docstatus === 1 ? "p-sub" : r.docstatus === 2 ? "p-cancel" : "p-draft"
                        }
                      >
                        {r.docstatus === 1
                          ? t("status.Submitted")
                          : r.docstatus === 2
                            ? t("status.Cancelled")
                            : t("status.Draft")}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
