/**
 * Brand create/edit form.
 * Callers: App.tsx /catalogue/brands/new and /catalogue/brands/:name.
 * API: taxmate.api.resource.insert/save on "Brand". Schema: brand (name field).
 * User: "Brand — /catalogue/brands, /new, /:name Fields: brand (name)"
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type Doc = { name: string; brand?: string };

export default function BrandForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.brand, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [brand, setBrand] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setBrand(d.brand || d.name || "");
  }, [existing.data]);

  const ready = !!brand.trim();

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const doc = isNew
        ? await create.createDoc(DT.brand, { brand })
        : await update.updateDoc(DT.brand, name, { brand });
      nav(`/catalogue/brands/${encodeURIComponent((doc as { name: string }).name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav("/catalogue/brands")}>
            {t("nav.brands")}
          </button>
        }
        title={isNew ? t("brand.new") : brand || name}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/catalogue/brands")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card>
        <div className="grid2">
          <Field label={t("brand.name")} required>
            <input className="ctl" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
        </div>
      </Card>
    </>
  );
}
