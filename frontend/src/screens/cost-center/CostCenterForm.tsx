/**
 * CostCenterForm — Phase 3.
 * Callers: App.tsx /cost-centers/new, /cost-centers/:name/edit
 * API: taxmate.api.resource.insert / save on "Cost Center" (_CORE_MASTERS)
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

type Doc = {
  name: string;
  cost_center_name?: string;
  company?: string;
  parent_cost_center?: string;
  is_group?: number;
};

export default function CostCenterForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const session = useSession();
  const company = session.company || "";

  const existing = useDoc<Doc>(DT.costCenter, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const parentCcs = useDocList<{ name: string; cost_center_name?: string }>(DT.costCenter, {
    fields: ["name", "cost_center_name"],
    filters: [
      ["is_group", "=", 1],
      ...(company ? [["company", "=", company] as [string, string, string]] : []),
    ],
    limit: 200,
  });

  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({
    cost_center_name: "",
    company,
    parent_cost_center: "",
    is_group: 0,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      cost_center_name: d.cost_center_name || d.name || "",
      company: d.company || company,
      parent_cost_center: d.parent_cost_center || "",
      is_group: d.is_group || 0,
    });
  }, [existing.data, company]);

  const setField = (k: keyof typeof form, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.cost_center_name.trim() && !!form.company.trim();

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.costCenter, form)) as { name: string };
        nav(`/cost-centers/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.costCenter, name, form);
        nav(`/cost-centers/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  const parentOptions = parentCcs.data ?? [];

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/cost-centers")}>
            {t("cc.title")}
          </button>
        }
        title={isNew ? t("cc.newTitle") : form.cost_center_name || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("cc.col.name")} required>
              <input
                className="ctl"
                value={form.cost_center_name}
                onChange={(e) => setField("cost_center_name", e.target.value)}
                placeholder={t("cc.namePh")}
              />
            </Field>
            <Field label={t("cc.col.company")}>
              <input className="ctl" value={form.company} readOnly disabled />
            </Field>
            <Field label={t("cc.col.parent")}>
              <select
                className="ctl"
                value={form.parent_cost_center}
                onChange={(e) => setField("parent_cost_center", e.target.value)}
              >
                <option value="">{t("cc.parentPh")}</option>
                {parentOptions.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.cost_center_name || p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("cc.col.isGroup")}>
              <select
                className="ctl"
                value={form.is_group}
                onChange={(e) => setField("is_group", Number(e.target.value))}
              >
                <option value={0}>{t("no")}</option>
                <option value={1}>{t("yes")}</option>
              </select>
            </Field>
          </div>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/cost-centers" : `/cost-centers/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
