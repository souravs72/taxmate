/**
 * Warehouse create/edit form.
 * Importers: App.tsx /warehouses/new, /warehouses/:name/edit.
 * API: taxmate.api.resource.insert/save. Desk layout via form_layout.get.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDeskForm } from "../../lib/deskForm";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";
import DocHistory from "../../components/DocHistory";

export default function WarehouseForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { isNew, existing, values, setField, seed, save, busy, saveError } = useDeskForm(DT.warehouse, name);

  useEffect(() => {
    if (!isNew) return;
    seed({ company: session.company || "" });
  }, [isNew, seed, session.company]);

  const title = String(values.warehouse_name || values.name || name);
  const ready = !!String(values.warehouse_name || "").trim() && !!values.company;

  async function onSave() {
    try {
      const doc = await save();
      nav(`/warehouses/${encodeURIComponent(String(doc.name))}`);
    } catch { /* saveError */ }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/warehouses")}>
            {t("nav.warehouses")}
          </button>
        }
        title={isNew ? t("wh.new") : title}
        actions={
          <>
            {!isNew ? <DocHistory doctype={DT.warehouse} name={name} /> : null}
            <button type="button" className="btn ghost" onClick={() => nav("/warehouses")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />

      <DocTabShell doctype={DT.warehouse} name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
