import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { date, money, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { BarRow, Card, Donut, Empty, ErrorBox, Legend, Loading, PageHead, StatTile } from "../../components/ui";

type ReportRow = Record<string, unknown>;

const AGE_COLOUR: Record<string, string> = {
  "0-30": "var(--c-billed)",
  "31-60": "var(--c-delivered)",
  "61-90": "var(--warn)",
  "91-120": "var(--c-confirmed)",
  "120+": "var(--bad)",
};

function ageBucket(age: number): keyof typeof AGE_COLOUR {
  if (age <= 30) return "0-30";
  if (age <= 60) return "31-60";
  if (age <= 90) return "61-90";
  if (age <= 120) return "91-120";
  return "120+";
}

export default function Payables() {
  const nav = useNavigate();
  const session = useSession();
  const cur = session.currency || "";
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
    { report_name: "Accounts Payable", filters },
    session.company ? ["Accounts Payable", session.company, today] : null,
    { isPaused: () => !session.company },
  );

  const rows = (report.data?.message?.result ?? []).filter((r) => r && !r.bold && r.voucher_no);

  const ageing = useMemo(() => {
    const buckets: Record<string, { n: number; amount: number }> = {
      "0-30": { n: 0, amount: 0 },
      "31-60": { n: 0, amount: 0 },
      "61-90": { n: 0, amount: 0 },
      "91-120": { n: 0, amount: 0 },
      "120+": { n: 0, amount: 0 },
    };
    let outstanding = 0;
    for (const r of rows) {
      const amt = Number(r.outstanding || r.outstanding_amount || 0);
      const age = Number(r.age ?? r.ageing ?? 0);
      outstanding += amt;
      const key = ageBucket(age);
      buckets[key].n += 1;
      buckets[key].amount += amt;
    }
    const overdue = buckets["31-60"].amount + buckets["61-90"].amount
      + buckets["91-120"].amount + buckets["120+"].amount;
    return { buckets, outstanding, overdue, count: rows.length };
  }, [rows]);

  const donut = Object.entries(AGE_COLOUR).map(([key, colour]) => ({
    key,
    label: t(`ap.age.${key}`),
    n: ageing.buckets[key].n,
    colour,
  }));
  const donutTotal = donut.reduce((a, b) => a + b.n, 0);
  const ready = !report.isLoading && !!session.company;

  return (
    <>
      <PageHead title={t("ap.title")} />
      {report.error && <ErrorBox error={report.error} onRetry={() => report.mutate()} />}

      {ready && (
        <div className="tiles">
          <StatTile colour="var(--brand)" tint="rgba(72,127,255,.14)"
            icon='<path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h3.5"/>'
            label={t("ap.tile.outstanding")} value={money(ageing.outstanding)} unit={cur}
            foot={`${ageing.count} ${t("ap.tile.outstandingFoot")}`} />
          <StatTile colour="var(--bad)" tint="rgba(220,38,38,.12)"
            icon='<path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/>'
            label={t("ap.tile.overdue")} value={money(ageing.overdue)} unit={cur}
            foot={t("ap.tile.overdueFoot")} />
          <StatTile colour="var(--c-billed)" tint="rgba(22,163,74,.13)"
            icon='<path d="M2 5.5h11.5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>'
            label={t("ap.tile.current")} value={money(ageing.buckets["0-30"].amount)} unit={cur}
            foot={t("ap.tile.currentFoot")} />
          <StatTile colour="var(--warn)" tint="rgba(217,119,6,.13)"
            icon='<path d="M3 15V8.5M7.5 15V3.5M12 15V10M15.5 15h-13"/>'
            label={t("ap.tile.bills")} value={ageing.count}
            foot={t("ap.tile.billsFoot")} />
        </div>
      )}

      <div className="charts">
        <Card title={t("ap.chart.age")} bodyClass="donutwrap">
          {!ready ? <Loading /> : (
            <>
              <Donut data={donut} total={donutTotal} centreLabel={t("ap.chart.all")} />
              <Legend data={donut} />
            </>
          )}
        </Card>
        {ready && (
          <Card title={t("ap.chart.value")} bodyClass="bars">
            <div className="hero">
              <span className="c">{cur}</span>
              <span className="n2">{money(ageing.outstanding)}</span>
            </div>
            {Object.entries(AGE_COLOUR).map(([key, colour]) => (
              <BarRow
                key={key}
                label={t(`ap.age.${key}`)}
                currency={cur}
                value={ageing.outstanding ? (ageing.buckets[key].amount / ageing.outstanding) * 100 : 0}
                amount={ageing.buckets[key].amount}
                colour={colour}
              />
            ))}
          </Card>
        )}
      </div>

      <Card bodyClass={null as unknown as string}>
        {!session.company || report.isLoading ? <Loading />
          : rows.length === 0 ? <Empty label={t("ap.empty")} />
          : (
            <div className="twrap">
              <table className="clickable">
                <thead>
                  <tr>
                    <th>{t("pi.col.no")}</th>
                    <th>{t("nav.suppliers")}</th>
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
                    return (
                      <tr key={`${voucher}-${i}`}>
                        <td><span className="ordno">{voucher}</span></td>
                        <td className="cust">{String(r.party || r.supplier_name || "")}</td>
                        <td className="dt">{date(String(r.posting_date || r.invoice_date || ""))}</td>
                        <td className="dt">{date(String(r.due_date || ""))}</td>
                        <td className="n tot">{money(Number(r.invoiced || r.invoice_amount || r.grand_total || 0))}</td>
                        <td className="n">{money(Number(r.outstanding || r.outstanding_amount || 0))}</td>
                        <td className="n">{String(r.age ?? r.ageing ?? "—")}</td>
                        <td>
                          {voucher && (
                            <button type="button" className="btn ghost sm"
                              onClick={() => nav(`/payments/new?type=Pay&invoice=${encodeURIComponent(voucher)}`)}>
                              {t("pi.pay")}
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
