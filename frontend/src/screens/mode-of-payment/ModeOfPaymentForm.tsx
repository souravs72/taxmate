/**
 * Mode of Payment create/edit form.
 * Callers: App.tsx /modes-of-payment/new, /modes-of-payment/:name/edit.
 * API: taxmate.api.resource.insert/save on "Mode of Payment".
 * Schema: { mode_of_payment (name field), type (Cash|Bank|General), enabled }
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

type Doc = {
  name: string;
  type?: string;
  enabled?: number;
};

const MOP_TYPES = ["Cash", "Bank", "General"];

export default function ModeOfPaymentForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.modeOfPayment, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();

  const [form, setFormState] = useState({
    mode_of_payment: "",
    type: "Cash",
    enabled: 1 as 0 | 1,
  });
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
  }, [existing.data]);

  const set = (k: string, v: string | number) => setFormState((f) => ({ ...f, [k]: v }));
  const ready = !!form.mode_of_payment && !!form.type;

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (isNew) {
        const doc = await create.createDoc(DT.modeOfPayment, {
          doctype: DT.modeOfPayment,
          // Mode of Payment uses the name field directly for the MOP name.
          name: form.mode_of_payment,
          type: form.type,
          enabled: form.enabled,
        }) as { name: string };
        nav(`/modes-of-payment/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.modeOfPayment, name, { type: form.type, enabled: form.enabled });
        nav(`/modes-of-payment/${encodeURIComponent(name)}`);
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
                  <option key={tp} value={tp}>{tp}</option>
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
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/modes-of-payment" : `/modes-of-payment/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
