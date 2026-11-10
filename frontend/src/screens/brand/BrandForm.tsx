/**
 * Brand create/edit form.
 * Callers: App.tsx /catalogue/brands/new and /catalogue/brands/:name.
 * API: taxmate.api.resource.insert/save on "Brand". Desk layout via form_layout.get.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDeskForm } from "../../lib/deskForm";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";

export default function BrandForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const { isNew, existing, values, setField, save, busy, saveError } = useDeskForm(DT.brand, name);
  const title = String(values.brand || values.name || name);
  const ready = !!String(values.brand || "").trim();

  async function onSave() {
    try {
      const doc = await save();
      nav(`/catalogue/brands/${encodeURIComponent(String(doc.name))}`);
    } catch { /* saveError */ }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/catalogue/brands")}>
            {t("nav.brands")}
          </button>
        }
        title={isNew ? t("brand.new") : title}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/catalogue/brands")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />

      <DocTabShell doctype={DT.brand} name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
