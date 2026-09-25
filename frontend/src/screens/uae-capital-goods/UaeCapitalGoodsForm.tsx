/**
 * UaeCapitalGoodsForm — Phase 22. Create/edit UAE Capital Goods Adjustment.
 * Callers: App.tsx /uae-capital-goods-adjustments/new, /:name/edit, /:name
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

export default function UaeCapitalGoodsForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const existing = useDoc(DT.uaeCapitalGoods, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const [form, setForm] = useState({ company: "", period_start: "", period_end: "", adjustment_amount: "", adjustment_vat: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const d = existing.data as Record<string, unknown> | undefined;
    if (!d || loaded) return;
    setForm({ company: String(d.company || ""), period_start: String(d.period_start || ""), period_end: String(d.period_end || ""), adjustment_amount: String(d.adjustment_amount || ""), adjustment_vat: String(d.adjustment_vat || ""), notes: String(d.notes || "") });
    setLoaded(true);
  }, [existing.data, loaded]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.company && !!form.period_start;

  async function saveFn() {
    if (!ready) return;
    setBusy(true); setSaveError(null);
    try {
      if (isNew) {
        const doc = (await create.createDoc(DT.uaeCapitalGoods, form)) as { name: string };
        nav(`/uae-capital-goods-adjustments/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.uaeCapitalGoods, name, form);
        nav(`/uae-capital-goods-adjustments/${encodeURIComponent(name)}`);
      }
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/uae-capital-goods-adjustments")}>{t("ucg.title")}</button>} title={isNew ? t("ucg.new") : name} />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("ucg.col.company")} required><input className="ctl" value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
            <Field label={t("ucg.col.periodStart")} required><input className="ctl" type="date" value={form.period_start} onChange={(e) => set("period_start", e.target.value)} /></Field>
            <Field label={t("ucg.col.periodEnd")}><input className="ctl" type="date" value={form.period_end} onChange={(e) => set("period_end", e.target.value)} /></Field>
            <Field label={t("ucg.col.amount")}><input className="ctl" type="number" value={form.adjustment_amount} onChange={(e) => set("adjustment_amount", e.target.value)} /></Field>
            <Field label={t("ucg.col.vatAdj")}><input className="ctl" type="number" value={form.adjustment_vat} onChange={(e) => set("adjustment_vat", e.target.value)} /></Field>
            <Field label={t("ucg.col.notes")}><textarea className="ctl" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} /></Field>
          </div>
        </Card>
        <FormActions onSave={() => void saveFn()} onDiscard={() => nav(isNew ? "/uae-capital-goods-adjustments" : `/uae-capital-goods-adjustments/${encodeURIComponent(name)}`)} busy={busy} ready={ready} />
      </FormLayout>
    </>
  );
}
