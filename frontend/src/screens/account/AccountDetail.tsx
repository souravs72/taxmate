import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  account_name?: string;
  account_number?: string;
  parent_account?: string;
  company?: string;
  root_type?: string;
  report_type?: string;
  account_type?: string;
  account_currency?: string;
  is_group?: number;
  disabled?: number;
  tax_rate?: number;
};

export default function AccountDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.account, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/accounts")}>
            {t("nav.accounts")}
          </button>
        }
        title={data.account_name || data.name}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          {data.root_type && <Pill cls="p-flat">{data.root_type}</Pill>}
          <Pill cls={data.is_group ? "p-flat" : "p-done"}>
            {data.is_group ? t("coa.group") : t("coa.leaf")}
          </Pill>
          {data.disabled ? <Pill cls="p-cxl">{t("coa.disabled")}</Pill> : null}
        </p>
      </PageHead>
      <Card>
        <ReadRow k={t("coa.company")} v={data.company || "—"} />
        <ReadRow k={t("coa.parent")} v={data.parent_account || "—"} />
        <ReadRow k={t("coa.root")} v={data.root_type || "—"} />
        <ReadRow k={t("coa.report")} v={data.report_type || "—"} />
        <ReadRow k={t("coa.type")} v={data.account_type || "—"} />
        <ReadRow k={t("coa.currency")} v={data.account_currency || "—"} />
        <ReadRow k={t("coa.number")} v={data.account_number || "—"} />
      </Card>
    </>
  );
}
