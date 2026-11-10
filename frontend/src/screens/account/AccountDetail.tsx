import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t, tStatus } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

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
  const session = useSession();
  const writable = canWrite(session);
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
        actions={
          <>
            <DocHistory doctype={DT.account} name={name} />
            {writable ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => nav(`/accounts/${encodeURIComponent(name)}/edit`)}
            >
              {t("inv.edit")}
            </button>
          ) : null}
          </>}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          {data.root_type && <Pill cls="p-flat">{tStatus(data.root_type)}</Pill>}
          <Pill cls={data.is_group ? "p-flat" : "p-done"}>
            {data.is_group ? t("coa.group") : t("coa.leaf")}
          </Pill>
          {data.disabled ? <Pill cls="p-cxl">{t("coa.disabled")}</Pill> : null}
        </p>
      </PageHead>

      <DocTabShell doctype={DT.account} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
