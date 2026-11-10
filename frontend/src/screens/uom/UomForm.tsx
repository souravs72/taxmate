/**
 * UOM create/edit form.
 * Callers: App.tsx /catalogue/uoms/new and /catalogue/uoms/:name.
 * API: taxmate.api.resource.insert/save on "UOM". Desk layout via form_layout.get.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDeskForm } from "../../lib/deskForm";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";

export default function UomForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const { isNew, existing, values, setField, save, busy, saveError } = useDeskForm(DT.uom, name);
  const title = String(values.uom_name || values.name || name);
  const ready = !!String(values.uom_name || "").trim();

  async function onSave() {
    try {
      const doc = await save();
      nav(`/catalogue/uoms/${encodeURIComponent(String(doc.name))}`);
    } catch { /* saveError */ }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/catalogue/uoms")}>
            {t("nav.uoms")}
          </button>
        }
        title={isNew ? t("uom.new") : title}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/catalogue/uoms")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />

      <DocTabShell doctype={DT.uom} name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
