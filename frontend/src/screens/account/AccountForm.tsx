/**
 * AccountForm — Phase 13. Create/edit leaf Account (is_group always 0).
 * Callers: App.tsx /accounts/new, /accounts/:name/edit
 * API: taxmate.api.resource.insert / save on "Account" (_CORE_MASTERS)
 * Fields: account_name, company, parent_account, account_type,
 *         root_type, account_currency, is_group=0
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

const ROOT_TYPES = ["Asset", "Liability", "Income", "Expense", "Equity"];
const ACCOUNT_TYPES = [
  "",
  "Bank",
  "Cash",
  "Chargeable",
  "Cost of Goods Sold",
  "Expense Account",
  "Fixed Asset",
  "Income Account",
  "Payable",
  "Receivable",
  "Stock",
  "Tax",
  "Temporary",
];

type Doc = {
  name: string;
  account_name?: string;
  company?: string;
  parent_account?: string;
  account_type?: string;
  root_type?: string;
  account_currency?: string;
  is_group?: number;
};

export default function AccountForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const session = useSession();
  const company = session.company || "";

  const existing = useDoc<Doc>(DT.account, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const parentAccounts = useDocList<{ name: string; account_name: string }>(DT.account, {
    fields: ["name", "account_name"],
    filters: [
      ["is_group", "=", 1],
      ...(company ? [["company", "=", company] as [string, string, string]] : []),
    ],
    limit: 200,
  });

  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({
    account_name: "",
    company,
    parent_account: "",
    account_type: "",
    root_type: "Asset",
    account_currency: "AED",
    is_group: 0 as 0 | 1,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      account_name: d.account_name || d.name || "",
      company: d.company || company,
      parent_account: d.parent_account || "",
      account_type: d.account_type || "",
      root_type: d.root_type || "Asset",
      account_currency: d.account_currency || "AED",
      is_group: (d.is_group || 0) as 0 | 1,
    });
  }, [existing.data, company]);

  const setField = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.account_name.trim() && !!form.company.trim();

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = { ...form };
      if (isNew) {
        const doc = (await create.createDoc(DT.account, payload)) as { name: string };
        nav(`/accounts/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.account, name, payload);
        nav(`/accounts/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  const parentOptions = parentAccounts.data ?? [];

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/accounts")}>
            {t("nav.accounts")}
          </button>
        }
        title={isNew ? t("acct.newTitle") : form.account_name || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("acct.col.name")} required>
              <input
                className="ctl"
                value={form.account_name}
                onChange={(e) => setField("account_name", e.target.value)}
                placeholder={t("acct.namePh")}
              />
            </Field>
            <Field label={t("coa.company")}>
              <input className="ctl" value={form.company} readOnly disabled />
            </Field>
            <Field label={t("acct.col.parent")}>
              <select
                className="ctl"
                value={form.parent_account}
                onChange={(e) => setField("parent_account", e.target.value)}
              >
                <option value="">{t("acct.parentPh")}</option>
                {parentOptions.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.account_name || a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("acct.col.rootType")}>
              <select
                className="ctl"
                value={form.root_type}
                onChange={(e) => setField("root_type", e.target.value)}
              >
                {ROOT_TYPES.map((rt) => (
                  <option key={rt} value={rt}>{rt}</option>
                ))}
              </select>
            </Field>
            <Field label={t("acct.col.type")}>
              <select
                className="ctl"
                value={form.account_type}
                onChange={(e) => setField("account_type", e.target.value)}
              >
                {ACCOUNT_TYPES.map((at) => (
                  <option key={at} value={at}>{at || t("acct.typePh")}</option>
                ))}
              </select>
            </Field>
            <Field label={t("acct.col.currency")}>
              <input
                className="ctl"
                value={form.account_currency}
                onChange={(e) => setField("account_currency", e.target.value)}
              />
            </Field>
            <Field label={t("acct.col.isGroup")}>
              <select
                className="ctl"
                value={form.is_group}
                onChange={(e) => setField("is_group", Number(e.target.value) as 0 | 1)}
              >
                <option value={0}>{t("no")}</option>
                <option value={1}>{t("yes")}</option>
              </select>
            </Field>
          </div>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/accounts" : `/accounts/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
