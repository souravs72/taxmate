import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

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

      <DocTabShell doctype={dt} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
