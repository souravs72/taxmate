/**
 * UaeRelatedPartyForm — Phase 22. Create/edit UAE CT Related Party.
 * Callers: App.tsx /uae-related-parties/new, /uae-related-parties/:name/edit, /uae-related-parties/:name
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

const PARTY_TYPES = ["Customer", "Supplier", "Employee", "Shareholder", "Director"];
const RELATIONSHIPS = ["Parent", "Subsidiary", "Associate", "Joint Venture", "Other Related Party"];

export default function UaeRelatedPartyForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const existing = useDoc(DT.uaeRelatedParty, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const [form, setForm] = useState({ company: "", party_type: "Customer", party: "", relationship: "Other Related Party", documentation_complete: 0 });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = existing.data as Record<string, unknown> | undefined;
    if (!d || loaded) return;
    setForm({ company: String(d.company || ""), party_type: String(d.party_type || "Customer"), party: String(d.party || ""), relationship: String(d.relationship || ""), documentation_complete: Number(d.documentation_complete || 0) });
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.company && !!form.party;

  async function saveFn() {
    if (!ready) return;
    setBusy(true); setSaveError(null);
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.uaeRelatedParty, form)) as { name: string };
        nav(`/uae-related-parties/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.uaeRelatedParty, name, form);
        nav(`/uae-related-parties/${encodeURIComponent(name)}`);
      }
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/uae-related-parties")}>{t("urp.title")}</button>}
        title={isNew ? t("urp.new") : (form.party || name)}
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("urp.col.company")} required><input className="ctl" value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
            <Field label={t("urp.col.partyType")}><select className="ctl" value={form.party_type} onChange={(e) => set("party_type", e.target.value)}>{PARTY_TYPES.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field label={t("urp.col.party")} required><input className="ctl" value={form.party} onChange={(e) => set("party", e.target.value)} /></Field>
            <Field label={t("urp.col.relationship")}><select className="ctl" value={form.relationship} onChange={(e) => set("relationship", e.target.value)}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label={t("urp.docComplete")}>
              <label className="check-label">
                <input type="checkbox" checked={!!form.documentation_complete} onChange={(e) => set("documentation_complete", e.target.checked ? 1 : 0)} />
                {t("urp.docCompleteLabel")}
              </label>
            </Field>
          </div>
        </Card>
        <FormActions onSave={() => void saveFn()} onDiscard={() => nav(isNew ? "/uae-related-parties" : `/uae-related-parties/${encodeURIComponent(name)}`)} busy={busy} ready={ready} />
      </FormLayout>
    </>
  );
}
