import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Line = { item_code?: string; item_name?: string; qty?: number; uom?: string; rate?: number; amount?: number };
type Doc = {
  name: string; customer?: string; customer_name?: string; posting_date?: string;
  company?: string; status?: string; docstatus?: number; currency?: string;
  grand_total?: number; net_total?: number; total_taxes_and_charges?: number;
  items?: Line[];
};

export default function DeliveryNoteDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.deliveryNote, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || "";

  return (
    <>
      <PageHead
        title={data.name}
        eyebrow={t("dn.title")}
        sub={data.customer_name || data.customer}
        actions={<button className="btn ghost" onClick={() => nav(-1)}>{t("common.back")}</button>}
      />
      <FormLayout
        aside={
          <Card title={t("dn.summary")}>
            <ReadRow k={t("dn.date")} v={date(data.posting_date)} />
            <ReadRow k={t("dn.status")} v={data.status} />
            <SumRow k={t("dn.net")} v={money(data.net_total)} currency={cur} />
            <SumRow k={t("dn.tax")} v={money(data.total_taxes_and_charges)} currency={cur} />
            <SumRow k={t("dn.grand")} v={money(data.grand_total)} currency={cur} />
          </Card>
        }
      >
        <Card title={t("dn.items")}>
          <table className="dt">
            <thead>
              <tr><th>{t("dn.item")}</th><th>{t("dn.qty")}</th><th>{t("dn.amount")}</th></tr>
            </thead>
            <tbody>
              {(data.items ?? []).map((row, i) => (
                <tr key={row.item_code ?? i}>
                  <td>{row.item_name || row.item_code}</td>
                  <td>{qty(row.qty)} {row.uom}</td>
                  <td>{money(row.amount)} {cur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </FormLayout>
    </>
  );
}
