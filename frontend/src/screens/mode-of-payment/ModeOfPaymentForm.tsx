/**
 * Mode of Payment create/edit form.
 * Callers: App.tsx /modes-of-payment/new, /modes-of-payment/:name/edit.
 * API: taxmate.api.resource.insert/save on "Mode of Payment".
 * Schema: { name, type, enabled, accounts: [{ company, default_account }] }
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

type MoPAccount = { company: string; default_account: string };

type Doc = {
  name: string;
  type?: string;
  enabled?: number;
  accounts?: MoPAccount[];
};

const MOP_TYPES = ["Cash", "Bank", "General"];

export default function ModeOfPaymentForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const company = session.company || "";

  const existing = useDoc<Doc>(DT.modeOfPayment, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [form, setFormState] = useState({
    mode_of_payment: "",
    type: "Cash",
    enabled: 1 as 0 | 1,
  });
  const [accounts, setAccounts] = useState<MoPAccount[]>([
    { company, default_account: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setFormState({
      mode_of_payment: d.name || "",
      type: d.type || "Cash",
      enabled: (d.enabled ?? 1) as 0 | 1,
    });
    const rows = (d.accounts ?? []).map((r) => ({
      company: r.company || "",
      default_account: r.default_account || "",
    }));
    setAccounts(rows.length ? rows : [{ company, default_account: "" }]);
  }, [existing.data, company]);

  const set = (k: string, v: string | number) => setFormState((f) => ({ ...f, [k]: v }));
  const ready =
    !!form.mode_of_payment &&
    !!form.type &&
    accounts.some((r) => r.company && r.default_account);

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    const child = accounts
      .filter((r) => r.company && r.default_account)
      .map((r) => ({
        doctype: "Mode of Payment Account",
        company: r.company,
        default_account: r.default_account,
      }));
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.modeOfPayment, {
          doctype: DT.modeOfPayment,
          name: form.mode_of_payment,
          type: form.type,
          enabled: form.enabled,
          accounts: child,
        })) as { name: string };
        nav(`/modes-of-payment/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.modeOfPayment, name, {
          type: form.type,
          enabled: form.enabled,
          accounts: child,
        });
        nav(`/modes-of-payment/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) {
    return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/modes-of-payment")}>
            {t("mop.title")}
          </button>
        }
        title={isNew ? t("mop.newTitle") : t("mop.editTitle")}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            {isNew && (
              <Field label={t("mop.name")} required>
                <input
                  type="text"
                  value={form.mode_of_payment}
                  onChange={(e) => set("mode_of_payment", e.target.value)}
                  placeholder={t("mop.namePh")}
                />
              </Field>
            )}
            <Field label={t("mop.type")} required>
              <select value={form.type} onChange={(e) => set("type", e.target.value)}>
                {MOP_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {tp}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("mop.enabledLabel")}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!form.enabled}
                  onChange={(e) => set("enabled", e.target.checked ? 1 : 0)}
                />
                {t("mop.enabledLabel")}
              </label>
            </Field>
          </div>
        </Card>
        <Card title={t("mop.accounts")}>
          <p className="sub" style={{ marginTop: 0 }}>
            {t("mop.accountsHint")}
          </p>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("mop.col.company")}</th>
                  <th>{t("mop.col.defaultAccount")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <LinkField
                        doctype="Company"
                        value={row.company}
                        onChange={(v) =>
                          setAccounts((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, company: v } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <LinkField
                        doctype="Account"
                        value={row.default_account}
                        filters={
                          row.company
                            ? [
                                ["company", "=", row.company],
                                ["is_group", "=", 0],
                                ["account_type", "in", ["Bank", "Cash"]],
                              ]
                            : [["is_group", "=", 0]]
                        }
                        onChange={(v) =>
                          setAccounts((rows) =>
                            rows.map((r, i) => (i === idx ? { ...r, default_account: v } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn quiet sm"
                        disabled={accounts.length <= 1}
                        onClick={() => setAccounts((rows) => rows.filter((_, i) => i !== idx))}
                      >
                        {t("mop.removeRow")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            style={{ marginTop: 8 }}
            onClick={() => setAccounts((rows) => [...rows, { company, default_account: "" }])}
          >
            {t("mop.addRow")}
          </button>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() =>
            nav(isNew ? "/modes-of-payment" : `/modes-of-payment/${encodeURIComponent(name)}`)
          }
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
