/**
 * ItemTaxTemplateDetail — edit and create an item tax template.
 * Callers: App.tsx /item-tax-templates/:name and /item-tax-templates/new
 * API: taxmate.api.resource.get / insert / save on "Item Tax Template"
 * Schema: title, company, disabled, taxes[{tax_type, tax_rate}]
 * User: Phase 5 Masters — item-tax form.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, CheckField, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LinkField from "../../components/LinkField";

type TaxRate = { _key: string; tax_type: string; tax_rate: number };
type Doc = {
  name: string;
  title?: string;
  company?: string;
  disabled?: number;
  taxes?: { tax_type?: string; tax_rate?: number }[];
};

let _k = 0;
const key = () => `tx${++_k}`;

export default function ItemTaxTemplateDetail() {
  const { name = "" } = useParams();
  const isNew = name === "new";
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>("Item Tax Template", isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [title, setTitle] = useState("");
  const [disabled, setDisabled] = useState<0 | 1>(0);
  const [rows, setRows] = useState<TaxRate[]>([{ _key: key(), tax_type: "", tax_rate: 0 }]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    if (!data) return;
    setTitle(data.title || "");
    setDisabled(data.disabled ? 1 : 0);
    const loaded = (data.taxes ?? []).map((r) => ({
      _key: key(),
      tax_type: r.tax_type || "",
      tax_rate: Number(r.tax_rate || 0),
    }));
    setRows(loaded.length ? loaded : [{ _key: key(), tax_type: "", tax_rate: 0 }]);
  }, [data]);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    setSaveError(null);
    const payload = {
      title: title.trim(),
      company: data?.company || session.company,
      disabled,
      taxes: rows.filter((r) => r.tax_type).map(({ _key: _drop, ...r }) => r),
    };
    try {
      if (isNew) {
        const doc = (await create.createDoc("Item Tax Template", payload)) as { name: string };
        nav(`/item-tax-templates/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc("Item Tax Template", name, payload);
        await mutate();
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && isLoading) return <Loading />;
  if (!isNew && error) return <ErrorBox error={error} onRetry={() => mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/item-tax-templates")}>
            {t("itt.title")}
          </button>
        }
        title={isNew ? t("itt.new") : title || name}
        actions={
          <button type="button" className="btn" disabled={busy || !title.trim()} onClick={() => void save()}>
            {t("common.save")}
          </button>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card>
        <div className="fg">
          <CheckField label={t("common.disabled")} hint={t("doc.offHint")} checked={!!disabled} onChange={(on) => setDisabled(on ? 1 : 0)} />
          <Field label={t("itt.col.name")} required>
            <input className="ctl" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card title={t("itt.rates")}>
        <div className="fg">
          {rows.map((r) => (
            <div className="grid2" key={r._key}>
              <Field label={t("itt.col.taxType")}>
                <LinkField
                  doctype={DT.account}
                  value={r.tax_type}
                  onChange={(v) => setRows((rs) => rs.map((x) => (x._key === r._key ? { ...x, tax_type: v } : x)))}
                />
              </Field>
              <Field label={t("tx.col.rate")}>
                <input
                  className="ctl"
                  type="number"
                  step="any"
                  value={r.tax_rate || ""}
                  onChange={(e) =>
                    setRows((rs) => rs.map((x) => (x._key === r._key ? { ...x, tax_rate: Number(e.target.value) } : x)))
                  }
                />
              </Field>
            </div>
          ))}
          <button
            type="button"
            className="btn quiet"
            onClick={() => setRows((rs) => [...rs, { _key: key(), tax_type: "", tax_rate: 0 }])}
          >
            {t("tx.addRow")}
          </button>
        </div>
      </Card>
    </>
  );
}
