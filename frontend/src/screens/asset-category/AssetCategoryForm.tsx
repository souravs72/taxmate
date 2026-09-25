/**
 * Asset Category form — new and edit.
 * Importers: App.tsx routes /asset-categories/new and /asset-categories/:name/edit.
 * API: taxmate.api.resource.insert / save.
 * Schema: asset_category_name (Data), enable_cwip_accounting (Check).
 * User: "Implement the plan… complete all the to-dos."
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

type Doc = { name: string; asset_category_name?: string; enable_cwip_accounting?: 0 | 1 };

export default function AssetCategoryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useDoc<Doc>(DT.assetCategory, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const [catName, setCatName] = useState("");
  const [cwip, setCwip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const insert = useInsert();
  const save = useSave();

  useEffect(() => {
    if (!isNew && existing.data) {
      setCatName(existing.data.asset_category_name ?? existing.data.name ?? "");
      setCwip(!!existing.data.enable_cwip_accounting);
    }
  }, [isNew, existing.data]);

  if (!session.user) return <Navigate to="/" />;
  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  async function handleSave() {
    setSaving(true); setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        doctype: DT.assetCategory,
        asset_category_name: catName,
        enable_cwip_accounting: cwip ? 1 : 0,
      };
      if (isNew) {
        const created = await insert.createDoc(DT.assetCategory, body);
        nav(`/asset-categories/${encodeURIComponent((created as { name: string }).name)}/edit`);
      } else {
        await save.updateDoc(DT.assetCategory, name, body);
        nav("/asset-categories");
      }
    } catch (e) { setSaveError(e); } finally { setSaving(false); }
  }

  return (
    <>
      <PageHead title={isNew ? t("ac.new") : name} eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/asset-categories")}>{t("ac.title")}</button>} />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card title={t("ac.title")}>
          <Field label={t("ac.col.name")}>
            <input className="inp" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder={t("ac.namePh")} />
          </Field>
          <Field label="">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cwip} onChange={(e) => setCwip(e.target.checked)} />
              {t("ac.col.cwip")}
            </label>
          </Field>
        </Card>
        <FormActions
          onDiscard={() => nav("/asset-categories")}
          onSave={handleSave}
          busy={saving}
        />
      </FormLayout>
    </>
  );
}
