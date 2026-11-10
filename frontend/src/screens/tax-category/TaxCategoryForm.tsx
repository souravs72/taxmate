/**
 * Tax Category create/edit. Callers: App.tsx /tax-categories/new, /:name/edit.
 * API: taxmate.api.resource.insert/save. Desk layout via form_layout.get.
 */
import { useNavigate, useParams } from "react-router-dom";
import { useDeskForm } from "../../lib/deskForm";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";

export default function TaxCategoryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const { isNew, existing, values, setField, save, busy, saveError } = useDeskForm("Tax Category", name);
  const title = String(values.title || values.name || name);
  const ready = !!String(values.title || "").trim();

  async function onSave() {
    try {
      const doc = await save();
      nav(`/tax-categories/${encodeURIComponent(String(doc.name))}`);
    } catch { /* saveError */ }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/tax-categories")}>
            {t("txc.title")}
          </button>
        }
        title={isNew ? t("txc.new") : title}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav(isNew ? "/tax-categories" : `/tax-categories/${encodeURIComponent(name)}`)}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>
              {busy ? t("soc.saving") : t("form.save")}
            </button>
          </>
        }
      />

      <DocTabShell doctype="Tax Category" name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
