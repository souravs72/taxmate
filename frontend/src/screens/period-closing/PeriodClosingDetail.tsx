/**
 * PeriodClosingDetail — Phase 5.
 * Callers: App.tsx /period-closing/:name
 * API: taxmate.api.resource.get on "Period Closing Voucher"
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  company?: string;
  transaction_date?: string;
  period_start_date?: string;
  period_end_date?: string;
  fiscal_year?: string;
  closing_account_head?: string;
  remarks?: string;
  docstatus?: number;
};

export default function PeriodClosingDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Period Closing Voucher", name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const st = data.docstatus === 1 ? "Submitted" : data.docstatus === 2 ? "Cancelled" : "Draft";

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/period-closing")}>
            {t("pcv.title")}
          </button>
        }
        title={data.name}
      >
        <Pill cls={data.docstatus === 1 ? "p-sub" : data.docstatus === 2 ? "p-cancel" : "p-draft"}>
          {t(`status.${st}`)}
        </Pill>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("pcv.col.date")} v={date(data.transaction_date)} />
          <ReadRow k={t("pcv.col.fiscalYear")} v={data.fiscal_year || "—"} />
          <ReadRow
            k={t("pcv.col.period")}
            v={
              data.period_start_date && data.period_end_date
                ? `${date(data.period_start_date)} – ${date(data.period_end_date)}`
                : "—"
            }
          />
          <ReadRow k={t("pcv.col.account")} v={data.closing_account_head || "—"} />
          {data.remarks && <ReadRow k={t("je.col.remark")} v={data.remarks} />}
        </div>
      </Card>
    </>
  );
}
