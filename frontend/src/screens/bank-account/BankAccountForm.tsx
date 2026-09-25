/**
 * Bank Account create/edit form.
 * Callers: App.tsx /bank-accounts/new, /bank-accounts/:name/edit.
 * API: taxmate.api.resource.insert/save on "Bank Account".
 * Schema: { account_name, bank, account, company, is_company_account, account_type, disabled }
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LinkField from "../../components/LinkField";
import { FormActions, FormLayout } from "../../components/form";

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

export default function BankAccountForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.bankAccount, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();

  const [form, setFormState] = useState({
    account_name: "",
    bank: "",
    account: "",
    company: session.company ?? "",
    is_company_account: 1 as 0 | 1,
    account_type: "",
    disabled: 0 as 0 | 1,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setFormState({
      account_name: d.account_name || d.name || "",
      bank: d.bank || "",
      account: d.account || "",
      company: d.company || session.company || "",
      is_company_account: (d.is_company_account ?? 1) as 0 | 1,
      account_type: d.account_type || "",
      disabled: (d.disabled || 0) as 0 | 1,
    });
  }, [existing.data, session.company]);

  const set = (k: string, v: string | number) => setFormState((f) => ({ ...f, [k]: v }));
  const ready = !!form.account_name && !!form.company;

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (isNew) {
        const doc = await create.createDoc(DT.bankAccount, { ...form, doctype: DT.bankAccount }) as { name: string };
        nav(`/bank-accounts/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.bankAccount, name, form);
        nav(`/bank-accounts/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/bank-accounts")}>
            {t("ba.title")}
          </button>
        }
        title={isNew ? t("ba.newTitle") : t("ba.editTitle")}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("ba.accountName")} required>
              <input
                type="text"
                value={form.account_name}
                onChange={(e) => set("account_name", e.target.value)}
                placeholder={t("ba.accountNamePh")}
              />
            </Field>
            <Field label={t("ba.bank")}>
              <LinkField
                doctype="Bank"
                value={form.bank}
                onChange={(v) => set("bank", v)}
                placeholder={t("ba.bankPh")}
              />
            </Field>
            <Field label={t("ba.account")}>
              <LinkField
                doctype="Account"
                value={form.account}
                onChange={(v) => set("account", v)}
                placeholder={t("ba.accountPh")}
              />
            </Field>
            <Field label={t("ba.col.company")} required>
              <LinkField
                doctype="Company"
                value={form.company}
                onChange={(v) => set("company", v)}
                placeholder={t("ba.companyPh")}
              />
            </Field>
            <Field label={t("ba.col.accountType")}>
              <input
                type="text"
                value={form.account_type}
                onChange={(e) => set("account_type", e.target.value)}
                placeholder={t("ba.accountTypePh")}
              />
            </Field>
            <Field label={t("ba.isCompanyAccount")}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!form.is_company_account}
                  onChange={(e) => set("is_company_account", e.target.checked ? 1 : 0)}
                />
                {t("ba.isCompanyAccount")}
              </label>
            </Field>
            {!isNew && (
              <Field label={t("ba.disabledLabel")}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!form.disabled}
                    onChange={(e) => set("disabled", e.target.checked ? 1 : 0)}
                  />
                  {t("ba.disabledLabel")}
                </label>
              </Field>
            )}
          </div>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/bank-accounts" : `/bank-accounts/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
