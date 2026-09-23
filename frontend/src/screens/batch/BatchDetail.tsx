/**
 * Batch detail. Route: /batches/:name. API: taxmate.api.resource.get on "Batch".
 * Callers: App.tsx. Phase 7.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type Doc = {
  name: string;
  item?: string;
  item_name?: string;
  expiry_date?: string;
  manufacturing_date?: string;
  description?: string;
  batch_qty?: number;
};

export default function BatchDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<Doc>(DT.batch, name, name);

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
      />
      <Card>
        <div className="grid2">
          <Field label={t("batch.item")}>
            <span>{d.item}{d.item_name && d.item_name !== d.item ? ` — ${d.item_name}` : ""}</span>
          </Field>
          <Field label={t("batch.expiry")}><span>{d.expiry_date || "—"}</span></Field>
          <Field label={t("batch.mfg")}><span>{d.manufacturing_date || "—"}</span></Field>
          {d.description && (
            <Field label={t("batch.description")}><span>{d.description}</span></Field>
          )}
          {d.batch_qty != null && (
            <Field label={t("batch.batchQty")}><span>{d.batch_qty}</span></Field>
          )}
        </div>
      </Card>
    </>
  );
}
