/**
 * Payment Terms Template create/edit form.
 * Callers: App.tsx /payment-terms-templates/new, /payment-terms-templates/:name/edit
 * API: taxmate.api.resource.insert/save on "Payment Terms Template"
 * Child table "Payment Term" (fieldname: terms) rows are included in payload.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LineItems, { type LineField } from "../../components/LineItems";
import { FormActions, FormLayout } from "../../components/form";

type TermRow = {
  _key: string;
  payment_term: string;
  due_date_based_on: string;
  invoice_portion: number;
  credit_days: number;
  credit_months: number;
  description: string;
};

type Doc = {
  name: string;
  template_name?: string;
  terms?: {
    payment_term?: string;
    due_date_based_on?: string;
    invoice_portion?: number;
    credit_days?: number;
    credit_months?: number;
    description?: string;
  }[];
};

let _rowKey = 0;
const newKey = () => `r${++_rowKey}`;

const emptyRow = (): TermRow => ({
  _key: newKey(),
  payment_term: "",
  due_date_based_on: "Day(s) after invoice date",
  invoice_portion: 100,
  credit_days: 30,
  credit_months: 0,
  description: "",
});

export default function PaymentTermsTemplateForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.paymentTerms, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [templateName, setTemplateName] = useState("");
  const [rows, setRows] = useState<TermRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setTemplateName(d.template_name || d.name || "");
    setRows(
      (d.terms ?? []).length > 0
        ? (d.terms ?? []).map((r) => ({
            _key: newKey(),
            payment_term: r.payment_term || "",
            due_date_based_on: r.due_date_based_on || "Day after invoice date",
            invoice_portion: Number(r.invoice_portion) || 100,
            credit_days: Number(r.credit_days) || 0,
            credit_months: Number(r.credit_months) || 0,
            description: r.description || "",
          }))
        : [emptyRow()]
    );
  }, [existing.data]);

  const setRow = (key: string, field: keyof TermRow, value: string | number) =>
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, [field]: value } : r)));

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r._key !== key) : rs));

  const ready = !!templateName.trim() && rows.every((r) => r.invoice_portion > 0);

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = {
        template_name: templateName,
        terms: rows.map(({ _key: _k, ...r }) => r),
      };
      if (isNew) {
        const doc = await create.createDoc(DT.paymentTerms, payload) as { name: string };
        nav(`/payment-terms-templates/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(DT.paymentTerms, name, payload);
        nav(`/payment-terms-templates/${encodeURIComponent(name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav("/payment-terms-templates")}>
            {t("ptt.title")}
          </button>
        }
        title={isNew ? t("ptt.newTitle") : templateName || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("ptt.col.name")} required>
              <input
                type="text"
                className="ctl"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("ptt.namePh")}
              />
            </Field>
          </div>
        </Card>

        <Card title={t("ptt.terms")}>
          {/* Was a raw <table className="data-table"> with five full-width
              controls per row and no .twrap, so on a phone it pushed the
              whole page 103px sideways rather than scrolling inside a box. */}
          <LineItems<TermRow>
            rows={rows}
            addWrap="inline"
            onRemove={(i) => removeRow(rows[i]._key)}
            addLabel={t("ptt.addTerm")}
            onAdd={addRow}
            fields={[
              {
                key: "name", label: t("ptt.term.name"), slot: "title",
                render: (r) => (
                  <input
                    className="ctl"
                    value={r.payment_term}
                    onChange={(e) => setRow(r._key, "payment_term", e.target.value)}
                    placeholder={t("ptt.term.namePh")}
                  />
                ),
              },
              {
                key: "basis", label: t("ptt.term.basis"),
                render: (r) => (
                  <select
                    className="ctl"
                    value={r.due_date_based_on}
                    onChange={(e) => setRow(r._key, "due_date_based_on", e.target.value)}
                  >
                    <option value="Day(s) after invoice date">{t("ptt.term.dayAfter")}</option>
                    <option value="Month(s) after the invoice date">{t("ptt.term.monthAfter")}</option>
                    <option value="Month(s) after the end of the invoice month">{t("ptt.term.monthEnd")}</option>
                  </select>
                ),
              },
              {
                key: "portion", label: t("ptt.term.portion"), slot: "primary",
                render: (r) => (
                  <input
                    className="ctl" type="number" min={0} max={100} step={0.01}
                    value={r.invoice_portion}
                    onChange={(e) => setRow(r._key, "invoice_portion", Number(e.target.value))}
                  />
                ),
              },
              {
                key: "days", label: t("ptt.term.days"), slot: "primary",
                render: (r) => (
                  <input
                    className="ctl" type="number" min={0}
                    value={r.credit_days}
                    onChange={(e) => setRow(r._key, "credit_days", Number(e.target.value))}
                  />
                ),
              },
              {
                key: "months", label: t("ptt.term.months"),
                render: (r) => (
                  <input
                    className="ctl" type="number" min={0}
                    value={r.credit_months}
                    onChange={(e) => setRow(r._key, "credit_months", Number(e.target.value))}
                  />
                ),
              },
            ] as LineField<TermRow>[]}
          />
        </Card>

        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() =>
            nav(isNew ? "/payment-terms-templates" : `/payment-terms-templates/${encodeURIComponent(name)}`)
          }
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
