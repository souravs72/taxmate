/**
 * Serial No detail. Route: /serial-nos/:name. API: taxmate.api.resource.get on "Serial No".
 * Callers: App.tsx. Phase 7.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type Doc = {
  name: string;
  item_code?: string;
  item_name?: string;
  batch_no?: string;
  warehouse?: string;
  status?: string;
  purchase_document_no?: string;
  delivery_document_no?: string;
  warranty_expiry_date?: string;
};

export default function SerialNoDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<Doc>(DT.serialNo, name, name);
  const save = useSave();
  const [warranty, setWarranty] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    if (doc.data) setWarranty(doc.data.warranty_expiry_date || "");
  }, [doc.data]);

  async function saveFn() {
    setBusy(true); setSaveError(null);
    try {
      await save.updateDoc(DT.serialNo, name, { warranty_expiry_date: warranty || undefined });
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
          <button type="button" className="btn quiet" onClick={() => nav("/serial-nos")}>
            {t("sn.title")}
          </button>
        }
        title={d.name}
        actions={
          <button type="button" className="btn" disabled={busy} onClick={() => void saveFn()}>
            {busy ? t("soc.saving") : t("soc.save")}
          </button>
        }
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <Card>
        <div className="grid2">
          <Field label={t("sn.item")}>
            <span>{d.item_code}{d.item_name && d.item_name !== d.item_code ? ` — ${d.item_name}` : ""}</span>
          </Field>
          <Field label={t("sn.batch")}><span>{d.batch_no || "—"}</span></Field>
          <Field label={t("sn.warehouse")}><span>{d.warehouse || "—"}</span></Field>
          <Field label={t("sn.status")}><span>{d.status || "—"}</span></Field>
          <Field label={t("sn.warranty")}>
            <input className="ctl" type="date" value={warranty} onChange={(e) => setWarranty(e.target.value)} />
          </Field>
          <Field label={t("sn.purchaseDoc")}><span>{d.purchase_document_no || "—"}</span></Field>
          <Field label={t("sn.deliveryDoc")}><span>{d.delivery_document_no || "—"}</span></Field>
        </div>
      </Card>
    </>
  );
}
