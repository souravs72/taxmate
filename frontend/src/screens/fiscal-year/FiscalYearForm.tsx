/**
 * FiscalYearForm — Phase 3.
 * Callers: App.tsx /fiscal-years/new, /fiscal-years/:name/edit
 * API: taxmate.api.resource.insert / save on "Fiscal Year" (_CORE_MASTERS)
 * Schema: {year, year_start_date, year_end_date, companies: [{company}]}
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

type Company = { company: string };
type Doc = {
  name: string;
  year?: string;
  year_start_date?: string;
  year_end_date?: string;
  companies?: Company[];
};

export default function FiscalYearForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";
  const session = useSession();

  const existing = useDoc<Doc>("Fiscal Year", isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const create = useInsert();
  const update = useSave();

  const today = toIsoDate(new Date());
  const [form, setForm] = useState({
    year: "",
    year_start_date: `${today.slice(0, 4)}-01-01`,
    year_end_date: `${today.slice(0, 4)}-12-31`,
    companies: session.company ? [{ company: session.company }] : [] as Company[],
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      year: d.year || d.name || "",
      year_start_date: d.year_start_date || "",
      year_end_date: d.year_end_date || "",
      companies: d.companies ?? [],
    });
  }, [existing.data]);

  const ready = !!form.year.trim() && !!form.year_start_date && !!form.year_end_date;

  function setField(k: keyof typeof form, v: string | Company[]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = { ...form };
      if (isNew) {
        const doc = (await create.createDoc("Fiscal Year", payload)) as { name: string };
        nav(`/fiscal-years/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc("Fiscal Year", name, payload);
        nav(`/fiscal-years/${encodeURIComponent(name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav("/fiscal-years")}>
            {t("fy.title")}
          </button>
        }
        title={isNew ? t("fy.newTitle") : form.year || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("fy.yearName")} required>
              <input
                className="ctl"
                value={form.year}
                onChange={(e) => setField("year", e.target.value)}
                placeholder={t("fy.namePh")}
              />
            </Field>
            <Field label={t("fy.col.start")} required>
              <input
                className="ctl"
                type="date"
                value={form.year_start_date}
                onChange={(e) => setField("year_start_date", e.target.value)}
              />
            </Field>
            <Field label={t("fy.col.end")} required>
              <input
                className="ctl"
                type="date"
                value={form.year_end_date}
                onChange={(e) => setField("year_end_date", e.target.value)}
              />
            </Field>
          </div>
        </Card>
        <Card title={t("fy.companies")}>
          {form.companies.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <input
                className="ctl"
                value={c.company}
                onChange={(e) => {
                  const next = form.companies.map((x, idx) =>
                    idx === i ? { company: e.target.value } : x,
                  );
                  setField("companies", next);
                }}
                placeholder={t("coa.company")}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn quiet sm"
                onClick={() => setField("companies", form.companies.filter((_, idx) => idx !== i))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost sm"
            onClick={() => setField("companies", [...form.companies, { company: session.company || "" }])}>
            {t("fy.addCompany")}
          </button>
        </Card>
        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() => nav(isNew ? "/fiscal-years" : `/fiscal-years/${encodeURIComponent(name)}`)}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
