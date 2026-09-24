/**
 * PeriodClosingDetail — Phase 5.
 * Callers: App.tsx /period-closing/:name
 * API: taxmate.api.resource.get on "Period Closing Voucher"
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { date, money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  company?: string;
  transaction_date?: string;
  closing_account_head?: string;
  net_total_profit?: number;
  remarks?: string;
  docstatus?: number;
};

export default function PeriodClosingDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Period Closing Voucher", name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = session.currency || "";
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
          <ReadRow k={t("pcv.col.account")} v={data.closing_account_head || "—"} />
          <ReadRow k={t("pcv.col.profit")} v={`${cur} ${money(Number(data.net_total_profit) || 0)}`} />
          {data.remarks && <ReadRow k={t("je.col.remark")} v={data.remarks} />}
        </div>
      </Card>
    </>
  );
}
