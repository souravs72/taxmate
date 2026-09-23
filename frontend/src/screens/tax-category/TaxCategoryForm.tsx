/**
 * TaxCategoryForm — create/edit Tax Category (Phase 11).
 * Callers: App.tsx /tax-categories/new, /tax-categories/:name/edit
 * API: taxmate.api.resource.insert / save on "Tax Category" (_CORE_MASTERS)
 * Schema: {title, is_reverse_charge}
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

type Doc = { name: string; title?: string; is_reverse_charge?: 0 | 1 };

export default function TaxCategoryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>("Tax Category", isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [title, setTitle] = useState("");
  const [isReverseCharge, setIsReverseCharge] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setTitle(d.title || d.name || "");
    setIsReverseCharge(d.is_reverse_charge ? 1 : 0);
  }, [existing.data]);

  const ready = !!title.trim();

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = { title, is_reverse_charge: isReverseCharge };
      if (isNew) {
        const doc = (await create.createDoc("Tax Category", payload)) as { name: string };
        nav(`/tax-categories/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc("Tax Category", name, payload);
        nav(`/tax-categories/${encodeURIComponent(name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav("/tax-categories")}>
            {t("txc.title")}
          </button>
        }
        title={isNew ? t("txc.new") : title || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("txc.col.name")} required>
              <input
                className="ctl"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("txc.ph")}
              />
            </Field>
            <Field label={t("txc.col.reverse")}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!isReverseCharge}
                  onChange={(e) => setIsReverseCharge(e.target.checked ? 1 : 0)}
                />
                {t("txc.reverseHint")}
              </label>
            </Field>
          </div>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() =>
            nav(isNew ? "/tax-categories" : `/tax-categories/${encodeURIComponent(name)}`)
          }
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
