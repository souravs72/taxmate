/**
 * ItemTaxTemplateDetail — Phase 11.
 * Callers: App.tsx /item-tax-templates/:name
 * API: taxmate.api.resource.get on "Item Tax Template"
 */
import { useNavigate, useParams } from "react-router-dom";

import { useDoc } from "../../lib/resource";
import { money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, ReadRow } from "../../components/ui";

type TaxRate = { tax_type?: string; tax_rate?: number };
type Doc = { name: string; title?: string; company?: string; taxes?: TaxRate[] };

export default function ItemTaxTemplateDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Item Tax Template", name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/item-tax-templates")}>
            {t("itt.title")}
          </button>
        }
        title={data.title || data.name}
      />
      <Card>
        <div className="fg">
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
        </div>
      </Card>
      <Card title={t("itt.rates")}>
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th>{t("itt.col.taxType")}</th>
                <th className="n">{t("tx.col.rate")}</th>
              </tr>
            </thead>
            <tbody>
              {(data.taxes ?? []).map((r, i) => (
                <tr key={i}>
                  <td>{r.tax_type || "—"}</td>
                  <td className="n tot">{money(r.tax_rate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
