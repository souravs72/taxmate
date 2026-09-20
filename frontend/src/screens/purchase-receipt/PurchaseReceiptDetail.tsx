import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { date, money, qty } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";

type Line = { item_code?: string; item_name?: string; qty?: number; uom?: string; rate?: number; amount?: number };
type Doc = {
  name: string; supplier?: string; supplier_name?: string; posting_date?: string;
  company?: string; status?: string; currency?: string;
  grand_total?: number; net_total?: number; total_taxes_and_charges?: number;
  items?: Line[];
};

function prPill(status?: string): string {
  if (status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Closed") return "p-cxl";
  if (status === "Return" || status === "Return Issued") return "p-warn";
  return "p-open";
}

export default function PurchaseReceiptDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.purchaseReceipt, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const cur = data.currency || "";

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/purchase-receipts")}>
            {t("nav.purchaseReceipts")}
          </button>
        }
        title={data.supplier_name || data.supplier || data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={prPill(data.status)}>{data.status || "—"}</Pill>
        </p>
      </PageHead>

      <FormLayout
        aside={
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("dn.summary")}</h2>
            <ReadRow k={t("inv.col.date")} v={date(data.posting_date)} />
            <SumRow k={t("sod.net")} v={money(data.net_total)} currency={cur} />
            <SumRow k={t("sod.vat")} v={money(data.total_taxes_and_charges)} currency={cur} />
            <SumRow k={t("sod.grand")} v={money(data.grand_total)} cls="rule total" currency={cur} />
          </Card>
        }
      >
        <Card title={t("dn.items")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("dn.item")}</th>
                  <th className="n">{t("dn.qty")}</th>
                  <th className="n">{t("dn.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((row, i) => (
                  <tr key={row.item_code ?? String(i)}>
                    <td>{row.item_name || row.item_code}</td>
                    <td className="n">{qty(row.qty)} {row.uom}</td>
                    <td className="n tot">{money(row.amount)}</td>
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
