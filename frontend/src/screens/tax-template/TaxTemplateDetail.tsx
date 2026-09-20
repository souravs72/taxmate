import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Charge = { charge_type?: string; account_head?: string; rate?: number; tax_amount?: number; description?: string };
type Doc = {
  name: string;
  title?: string;
  company?: string;
  is_default?: number;
  disabled?: number;
  taxes?: Charge[];
};

export default function TaxTemplateDetail() {
  const { name = "", kind: kindParam = "sales" } = useParams();
  const kind = kindParam === "purchase" ? "purchase" : "sales";
  const nav = useNavigate();
  const dt = kind === "purchase" ? DT.purchaseTaxTemplate : DT.taxTemplate;
  const { data, error, isLoading, mutate } = useDoc<Doc>(dt, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav(`/tax-templates?kind=${kind}`)}>{t("nav.taxTemplates")}</button>}
        title={data.title || data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls="p-flat">{kind === "purchase" ? t("tx.purchase") : t("tx.sales")}</Pill>
          {data.is_default ? <Pill cls="p-done">{t("tx.col.default")}</Pill> : null}
        </p>
      </PageHead>
      <Card>
        <ReadRow k={t("coa.company")} v={data.company || "—"} />
      </Card>
      <Card title={t("tx.charges")}>
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th>{t("tx.col.account")}</th>
                <th>{t("tx.col.charge")}</th>
                <th className="n">{t("tx.col.rate")}</th>
              </tr>
            </thead>
            <tbody>
              {(data.taxes ?? []).map((row, i) => (
                <tr key={`${row.account_head}-${i}`}>
                  <td>{row.account_head || row.description || "—"}</td>
                  <td>{row.charge_type || "—"}</td>
                  <td className="n tot">{money(row.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
