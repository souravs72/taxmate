/**
 * UOM create/edit form.
 * Callers: App.tsx /catalogue/uoms/new and /catalogue/uoms/:name.
 * API: taxmate.api.resource.insert/save on "UOM". Schema: uom_name, must_be_whole_number.
 * User: "UOM — /catalogue/uoms, /new, /:name Fields: uom_name, must_be_whole_number"
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type Doc = { name: string; uom_name?: string; must_be_whole_number?: number };

export default function UomForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.uom, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({ uom_name: "", must_be_whole_number: 0 as 0 | 1 });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      uom_name: d.uom_name || d.name || "",
      must_be_whole_number: (d.must_be_whole_number || 0) as 0 | 1,
    });
  }, [existing.data]);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.uom_name.trim();

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        uom_name: form.uom_name,
        must_be_whole_number: form.must_be_whole_number,
      };
      const doc = isNew
        ? await create.createDoc(DT.uom, payload)
        : await update.updateDoc(DT.uom, name, payload);
      nav(`/catalogue/uoms/${encodeURIComponent((doc as { name: string }).name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav("/catalogue/uoms")}>
            {t("nav.uoms")}
          </button>
        }
        title={isNew ? t("uom.new") : form.uom_name || name}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/catalogue/uoms")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card>
        <div className="grid2">
          <Field label={t("uom.name")} required>
            <input className="ctl" value={form.uom_name} onChange={(e) => set("uom_name", e.target.value)} />
          </Field>
          <Field label={t("uom.whole")}>
            <select className="ctl" value={String(form.must_be_whole_number)} onChange={(e) => set("must_be_whole_number", Number(e.target.value))}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
        </div>
      </Card>
    </>
  );
}
