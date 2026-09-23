/**
 * Price List create/edit form.
 * Callers: App.tsx /price-lists/new, /price-lists/:name/edit
 * API: taxmate.api.resource.insert/save on "Price List"
 * Schema: { price_list_name, currency, selling, buying, enabled }
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type Doc = {
  name: string;
  price_list_name?: string;
  currency?: string;
  selling?: number;
  buying?: number;
  enabled?: number;
};

export default function PriceListForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.priceList, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({
    price_list_name: "",
    currency: "AED",
    selling: 1 as 0 | 1,
    buying: 0 as 0 | 1,
    enabled: 1 as 0 | 1,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      price_list_name: d.price_list_name || d.name || "",
      currency: d.currency || "AED",
      selling: (d.selling ?? 1) as 0 | 1,
      buying: (d.buying ?? 0) as 0 | 1,
      enabled: (d.enabled ?? 1) as 0 | 1,
    });
  }, [existing.data]);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.price_list_name && !!form.currency;

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      if (isNew) {
        const doc = await create.createDoc(DT.priceList, { ...form }) as { name: string };
        nav(`/price-lists/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.priceList, name, form);
        nav(`/price-lists/${encodeURIComponent(name)}`);
      }
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
          <button type="button" className="btn quiet" onClick={() => nav("/price-lists")}>
            {t("pl.title")}
          </button>
        }
        title={isNew ? t("pl.newTitle") : form.price_list_name || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("pl.col.name")} required>
              <input
                type="text"
                className="ctl"
                value={form.price_list_name}
                onChange={(e) => set("price_list_name", e.target.value)}
                placeholder={t("pl.namePh")}
                disabled={!isNew}
              />
            </Field>
            <Field label={t("pl.col.currency")} required>
              <LinkField
                doctype="Currency"
                value={form.currency}
                onChange={(v) => set("currency", v)}
                placeholder="AED"
              />
            </Field>
            <Field label={t("pl.col.selling")}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!form.selling}
                  onChange={(e) => set("selling", e.target.checked ? 1 : 0)}
                />
                {t("pl.col.selling")}
              </label>
            </Field>
            <Field label={t("pl.col.buying")}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!form.buying}
                  onChange={(e) => set("buying", e.target.checked ? 1 : 0)}
                />
                {t("pl.col.buying")}
              </label>
            </Field>
            {!isNew && (
              <Field label={t("pl.col.enabled")}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!form.enabled}
                    onChange={(e) => set("enabled", e.target.checked ? 1 : 0)}
                  />
                  {t("pl.col.enabled")}
                </label>
              </Field>
            )}
          </div>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/price-lists" : `/price-lists/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
