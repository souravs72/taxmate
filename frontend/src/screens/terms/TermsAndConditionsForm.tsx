/**
 * TermsAndConditionsForm — Phase 15.
 * Callers: App.tsx /terms-and-conditions/new, /terms-and-conditions/:name/edit
 * API: taxmate.api.resource.insert / save on "Terms and Conditions" (_CORE_MASTERS)
 * Fields: title, buying:0|1, selling:0|1, terms (long text)
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

type Doc = {
  name: string;
  title?: string;
  buying?: 0 | 1;
  selling?: 0 | 1;
  terms?: string;
};

export default function TermsAndConditionsForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(
    "Terms and Conditions",
    isNew ? undefined : name,
    isNew ? null : name,
    { isPaused: () => isNew },
  );
  const create = useInsert();
  const update = useSave();

  const [termsTitle, setTermsTitle] = useState("");
  const [selling, setSelling] = useState<0 | 1>(1);
  const [buying, setBuying] = useState<0 | 1>(0);
  const [terms, setTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setTermsTitle(d.title || d.name || "");
    setSelling(d.selling ? 1 : 0);
    setBuying(d.buying ? 1 : 0);
    setTerms(d.terms || "");
  }, [existing.data]);

  const ready = !!termsTitle.trim();

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = { title: termsTitle, buying, selling, terms };
      if (isNew) {
        const doc = (await create.createDoc("Terms and Conditions", payload)) as { name: string };
        nav(`/terms-and-conditions/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc("Terms and Conditions", name, payload);
        nav(`/terms-and-conditions/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error)
    return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button
            type="button"
            className="btn quiet"
            onClick={() => nav("/terms-and-conditions")}
          >
            {t("tc.title")}
          </button>
        }
        title={isNew ? t("tc.new") : termsTitle || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("tc.col.name")} required>
              <input
                className="ctl"
                value={termsTitle}
                onChange={(e) => setTermsTitle(e.target.value)}
                placeholder={t("tc.titlePh")}
              />
            </Field>
            <Field label={t("tc.col.scope")}>
              <div style={{ display: "flex", gap: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!selling}
                    onChange={(e) => setSelling(e.target.checked ? 1 : 0)}
                  />
                  {t("tc.selling")}
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!buying}
                    onChange={(e) => setBuying(e.target.checked ? 1 : 0)}
                  />
                  {t("tc.buying")}
                </label>
              </div>
            </Field>
          </div>
        </Card>
        <Card title={t("tc.terms")}>
          <textarea
            className="ctl"
            rows={12}
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={t("tc.termsPh")}
          />
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() =>
            nav(
              isNew
                ? "/terms-and-conditions"
                : `/terms-and-conditions/${encodeURIComponent(name)}`,
            )
          }
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
