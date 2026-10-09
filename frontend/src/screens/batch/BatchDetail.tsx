/**
 * Batch detail. Route: /batches/:name. API: taxmate.api.resource.get on "Batch".
 * Callers: App.tsx. Phase 7.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, CheckField, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import DocHistory from "../../components/DocHistory";

type Doc = {
  name: string;
  item?: string;
  item_name?: string;
  expiry_date?: string;
  manufacturing_date?: string;
  description?: string;
  batch_qty?: number;
  disabled?: number;
};

export default function BatchDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<Doc>(DT.batch, name, name);
  const save = useSave();
  const [expiry, setExpiry] = useState("");
  const [mfg, setMfg] = useState("");
  const [description, setDescription] = useState("");
  const [disabled, setDisabled] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = doc.data;
    if (!d) return;
    setExpiry(d.expiry_date || "");
    setMfg(d.manufacturing_date || "");
    setDescription(d.description || "");
    setDisabled(d.disabled ? 1 : 0);
  }, [doc.data]);

  async function saveFn() {
    setBusy(true); setSaveError(null);
    try {
      await save.updateDoc(DT.batch, name, {
        expiry_date: expiry || undefined,
        manufacturing_date: mfg || undefined,
        description: description || undefined,
        disabled,
      });
      doc.mutate();
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (doc.isLoading) return <Loading />;
  if (doc.error) return <ErrorBox error={doc.error} onRetry={() => doc.mutate()} />;
  const d = doc.data;
  if (!d) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/batches")}>
            {t("batch.title")}
          </button>
        }
        title={d.name}
        actions={
          <>
            <DocHistory doctype={DT.batch} name={name} />
            <button type="button" className="btn" disabled={busy} onClick={() => void saveFn()}>
            {busy ? t("soc.saving") : t("soc.save")}
          </button>
          </>
        }
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <Card>
        <div className="grid2">
          <Field label={t("batch.item")}>
            <span>{d.item}{d.item_name && d.item_name !== d.item ? ` — ${d.item_name}` : ""}</span>
          </Field>
          <Field label={t("batch.expiry")}>
            <input className="ctl" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
          <Field label={t("batch.mfg")}>
            <input className="ctl" type="date" value={mfg} onChange={(e) => setMfg(e.target.value)} />
          </Field>
          <Field label={t("batch.description")}>
            <input className="ctl" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <CheckField label={t("common.disabled")} hint={t("doc.offHint")} checked={!!disabled} onChange={(on) => setDisabled(on ? 1 : 0)} />
          {d.batch_qty != null && (
            <Field label={t("batch.batchQty")}><span>{d.batch_qty}</span></Field>
          )}
        </div>
      </Card>
    </>
  );
}
