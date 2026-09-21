import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales } from "../../lib/roles";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Line = {
  account?: string;
  party_type?: string;
  party?: string;
  debit_in_account_currency?: number;
  credit_in_account_currency?: number;
  user_remark?: string;
  cost_center?: string;
};

type Doc = {
  name: string;
  posting_date?: string;
  voucher_type?: string;
  company?: string;
  user_remark?: string;
  total_debit?: number;
  total_credit?: number;
  docstatus?: 0 | 1 | 2;
  currency?: string;
  accounts?: Line[];
};

function jePill(ds?: number): string {
  if (ds === 0) return "p-draft";
  if (ds === 2) return "p-cxl";
  return "p-done";
}

export default function JournalEntryDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.journalEntry, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || session.currency || "";
  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);
  const busyError = submitCall.error || cancelCall.error;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/journals")}>
            {t("nav.journals")}
          </button>
        }
        title={data.voucher_type || data.name}
        actions={
          <>
            {draft && (
              <button type="button" className="btn ghost"
                onClick={() => nav(`/journals/${encodeURIComponent(name)}/edit`)}>
                {t("inv.edit")}
              </button>
            )}
            {draft && canSubmit && (
              <button type="button" className="btn" disabled={submitCall.loading}
                onClick={() => void submitCall.call({ doc: { doctype: DT.journalEntry, name } }).then(() => mutate())}>
                {t("inv.submit")}
              </button>
            )}
            {submitted && canCancel && (
              <button type="button" className="btn quiet" disabled={cancelCall.loading}
                onClick={() => void cancelCall.call({ doctype: DT.journalEntry, name }).then(() => mutate())}>
                {t("inv.cancel")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={jePill(data.docstatus)}>
            {data.docstatus === 0 ? t("pay.status.Draft") : data.docstatus === 2 ? t("pay.status.Cancelled") : t("pay.status.Submitted")}
          </Pill>
        </p>
      </PageHead>

      {busyError && <ErrorBox error={busyError} />}

      <FormLayout
        aside={
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("je.totals")}</h2>
            <SumRow k={t("je.col.debit")} v={money(data.total_debit)} currency={cur} />
            <SumRow k={t("je.col.credit")} v={money(data.total_credit)} cls="rule total" currency={cur} />
          </Card>
        }
      >
        <Card>
          <div className="fg">
            <ReadRow k={t("inv.col.date")} v={date(data.posting_date)} />
            <ReadRow k={t("je.col.type")} v={data.voucher_type || "—"} />
            <ReadRow k={t("je.col.remark")} v={data.user_remark || "—"} />
          </div>
        </Card>
        <Card title={t("je.accounts")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("je.account")}</th>
                  <th>{t("je.costCenter")}</th>
                  <th>{t("je.party")}</th>
                  <th className="n">{t("je.col.debit")}</th>
                  <th className="n">{t("je.col.credit")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.accounts ?? []).map((row, i) => (
                  <tr key={`${row.account}-${i}`}>
                    <td>{row.account}</td>
                    <td>{row.cost_center || "—"}</td>
                    <td>{row.party || "—"}</td>
                    <td className="n">{money(row.debit_in_account_currency)}</td>
                    <td className="n tot">{money(row.credit_in_account_currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
