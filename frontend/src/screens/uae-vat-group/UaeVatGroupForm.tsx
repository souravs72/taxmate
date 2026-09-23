/**
 * UaeVatGroupForm — Phase 22. Create/edit UAE VAT Group.
 * Callers: App.tsx /uae-vat-groups/new, /:name/edit, /:name
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

export default function UaeVatGroupForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const existing = useDoc(DT.uaeVatGroup, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const [form, setForm] = useState({ representative_company: "", group_trn: "", election_date: "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = existing.data as Record<string, unknown> | undefined;
    if (!d || loaded) return;
    setForm({ representative_company: String(d.representative_company || ""), group_trn: String(d.group_trn || ""), election_date: String(d.election_date || "") });
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.representative_company;

  async function saveFn() {
    if (!ready) return;
    setBusy(true); setSaveError(null);
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.uaeVatGroup, form)) as { name: string };
        nav(`/uae-vat-groups/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.uaeVatGroup, name, form);
        nav(`/uae-vat-groups/${encodeURIComponent(name)}`);
      }
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/uae-vat-groups")}>{t("uvg.title")}</button>}
        title={isNew ? t("uvg.new") : (form.representative_company || name)}
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("uvg.col.representative")} required><input className="ctl" value={form.representative_company} onChange={(e) => set("representative_company", e.target.value)} /></Field>
            <Field label={t("uvg.col.trn")}><input className="ctl" value={form.group_trn} onChange={(e) => set("group_trn", e.target.value)} /></Field>
            <Field label={t("uvg.col.electionDate")}><input className="ctl" type="date" value={form.election_date} onChange={(e) => set("election_date", e.target.value)} /></Field>
          </div>
        </Card>
        <FormActions onSave={() => void saveFn()} onDiscard={() => nav(isNew ? "/uae-vat-groups" : `/uae-vat-groups/${encodeURIComponent(name)}`)} busy={busy} ready={ready} />
      </FormLayout>
    </>
  );
}
