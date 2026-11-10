/**
 * Asset Category form — new and edit.
 * Importers: App.tsx /asset-categories/new and /:name/edit.
 * API: taxmate.api.resource.insert/save. Desk layout via form_layout.get.
 */
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDeskForm } from "../../lib/deskForm";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";

export default function AssetCategoryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { isNew, existing, values, setField, save, busy, saveError } = useDeskForm(DT.assetCategory, name);
  const ready = !!String(values.asset_category_name || "").trim();

  async function onSave() {
    try {
      const doc = await save();
      nav(`/asset-categories/${encodeURIComponent(String(doc.name))}/edit`);
    } catch { /* saveError */ }
  }

  if (!session.user) return <Navigate to="/" />;
  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        title={isNew ? t("ac.new") : name}
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/asset-categories")}>{t("ac.title")}</button>}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/asset-categories")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>
              {busy ? t("soc.saving") : t("form.save")}
            </button>
          </>
        }
      />

      <DocTabShell doctype={DT.assetCategory} name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
