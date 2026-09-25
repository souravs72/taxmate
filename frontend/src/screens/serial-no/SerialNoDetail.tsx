/**
 * Serial No detail. Route: /serial-nos/:name. API: taxmate.api.resource.get on "Serial No".
 * Callers: App.tsx. Phase 7.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
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
};

export default function SerialNoDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<Doc>(DT.serialNo, name, name);

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
      />
      <Card>
        <div className="grid2">
          <Field label={t("sn.item")}>
            <span>{d.item_code}{d.item_name && d.item_name !== d.item_code ? ` — ${d.item_name}` : ""}</span>
          </Field>
          <Field label={t("sn.batch")}><span>{d.batch_no || "—"}</span></Field>
          <Field label={t("sn.warehouse")}><span>{d.warehouse || "—"}</span></Field>
          <Field label={t("sn.status")}><span>{d.status || "—"}</span></Field>
          <Field label={t("sn.purchaseDoc")}><span>{d.purchase_document_no || "—"}</span></Field>
          <Field label={t("sn.deliveryDoc")}><span>{d.delivery_document_no || "—"}</span></Field>
        </div>
      </Card>
    </>
  );
}
