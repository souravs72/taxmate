/**
 * Bank Account detail — read-only view with Edit action for writers.
 * Callers: App.tsx /bank-accounts/:name.
 * API: taxmate.api.resource.get on "Bank Account".
 * Schema: { name, account_name, bank, account, company, is_company_account, account_type, disabled }
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  account_name?: string;
  bank?: string;
  account?: string;
  company?: string;
  is_company_account?: number;
  account_type?: string;
  disabled?: number;
};

export default function BankAccountDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.bankAccount, name);
  const writable = canWrite(session);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/bank-accounts")}>
            {t("ba.title")}
          </button>
        }
        title={data.account_name || data.name}
        actions={
          writable ? (
            <button type="button" className="btn ghost"
              onClick={() => nav(`/bank-accounts/${encodeURIComponent(name)}/edit`)}>
              {t("inv.edit")}
            </button>
          ) : undefined
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          {data.disabled
            ? <Pill cls="p-cxl">{t("ba.disabled")}</Pill>
            : <Pill cls="p-done">{t("ba.active")}</Pill>}
          {data.is_company_account ? <Pill cls="p-flat">{t("ba.companyAccount")}</Pill> : null}
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("ba.col.accountName")} v={data.account_name || "—"} />
          <ReadRow k={t("ba.col.bank")} v={data.bank || "—"} />
          <ReadRow k={t("ba.col.account")} v={data.account || "—"} />
          <ReadRow k={t("ba.col.company")} v={data.company || "—"} />
          {data.account_type && <ReadRow k={t("ba.col.accountType")} v={data.account_type} />}
        </div>
      </Card>
    </>
  );
}
