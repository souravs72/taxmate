/**
 * UaeCustomsForm — Phase 22. Create/edit UAE Customs Declaration.
 * Callers: App.tsx /uae-customs-declarations/new, /:name/edit, /:name
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

export default function UaeCustomsForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const existing = useDoc(DT.uaeCustoms, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const [form, setForm] = useState({ company: "", posting_date: "", declaration_number: "", supplier: "", purchase_invoice: "", taxable_amount: "", vat_amount: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = existing.data as Record<string, unknown> | undefined;
    if (!d || loaded) return;
    setForm({ company: String(d.company || ""), posting_date: String(d.posting_date || ""), declaration_number: String(d.declaration_number || ""), supplier: String(d.supplier || ""), purchase_invoice: String(d.purchase_invoice || ""), taxable_amount: String(d.taxable_amount || ""), vat_amount: String(d.vat_amount || ""), notes: String(d.notes || "") });
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.company && !!form.posting_date;

  async function saveFn() {
    if (!ready) return;
    setBusy(true); setSaveError(null);
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.uaeCustoms, form)) as { name: string };
        nav(`/uae-customs-declarations/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.uaeCustoms, name, form);
        nav(`/uae-customs-declarations/${encodeURIComponent(name)}`);
      }
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/uae-customs-declarations")}>{t("ucd.title")}</button>} title={isNew ? t("ucd.new") : name} />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("ucd.col.company")} required><input className="ctl" value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
            <Field label={t("ucd.col.date")} required><input className="ctl" type="date" value={form.posting_date} onChange={(e) => set("posting_date", e.target.value)} /></Field>
            <Field label={t("ucd.col.declNo")}><input className="ctl" value={form.declaration_number} onChange={(e) => set("declaration_number", e.target.value)} /></Field>
            <Field label={t("ucd.col.supplier")}><input className="ctl" value={form.supplier} onChange={(e) => set("supplier", e.target.value)} /></Field>
            <Field label={t("ucd.col.invoice")}><input className="ctl" value={form.purchase_invoice} onChange={(e) => set("purchase_invoice", e.target.value)} /></Field>
            <Field label={t("ucd.col.taxable")}><input className="ctl" type="number" value={form.taxable_amount} onChange={(e) => set("taxable_amount", e.target.value)} /></Field>
            <Field label={t("ucd.col.vat")}><input className="ctl" type="number" value={form.vat_amount} onChange={(e) => set("vat_amount", e.target.value)} /></Field>
            <Field label={t("ucd.col.notes")}><textarea className="ctl" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} /></Field>
          </div>
        </Card>
        <FormActions onSave={() => void saveFn()} onDiscard={() => nav(isNew ? "/uae-customs-declarations" : `/uae-customs-declarations/${encodeURIComponent(name)}`)} busy={busy} ready={ready} />
      </FormLayout>
    </>
  );
}
