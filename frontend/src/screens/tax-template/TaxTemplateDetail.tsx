import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { money } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import LineItems, { type LineField } from "../../components/LineItems";

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
        actions=<DocHistory doctype={dt} name={name} />
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls="p-flat">{kind === "purchase" ? t("tx.purchase") : t("tx.sales")}</Pill>
          {data.is_default ? <Pill cls="p-done">{t("tx.col.default")}</Pill> : null}
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
        </div>
      </Card>
      <Card title={t("tx.charges")}>
        {/* Three read-only columns and nothing else in the table body: no
            add, no remove, and collapse off so the charge type stays visible. */}
        <LineItems<Charge>
          rows={data.taxes ?? []}
          collapse={false}
          fields={[
            {
              key: "account", label: t("tx.col.account"), slot: "title",
              render: (row) => <>{row.account_head || row.description || "—"}</>,
            },
            {
              key: "charge", label: t("tx.col.charge"),
              render: (row) => <>{row.charge_type || "—"}</>,
            },
            {
              key: "rate", label: t("tx.col.rate"), slot: "primary", numeric: true,
              tdClass: "tot",
              render: (row) => <>{money(row.rate)}</>,
            },
          ] as LineField<Charge>[]}
        />
      </Card>
    </>
  );
}
