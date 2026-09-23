/**
 * WorkOrderDetail — Phase 18. Work Order detail with SE creation.
 * Callers: App.tsx /work-orders/:name
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string; bom_no?: string; item_name?: string; qty?: number; produced_qty?: number;
  planned_start_date?: string; wip_warehouse?: string; fg_warehouse?: string;
  company?: string; status?: string; docstatus?: number;
};

function woPill(status?: string): string {
  if (!status || status === "Draft") return "p-draft";
  if (status === "Completed") return "p-done";
  if (status === "Cancelled" || status === "Stopped") return "p-cxl";
  if (status === "In Process") return "p-open";
  return "p-flat";
}

export default function WorkOrderDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.workOrder, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  async function doAction(kind: "submit" | "cancel") {
    setBusy(true); setActionError(null);
    try {
      if (kind === "submit") await submitCall.call({ doctype: DT.workOrder, name });
      else await cancelCall.call({ doctype: DT.workOrder, name });
      mutate();
    } catch (err) { setActionError(err); }
    finally { setBusy(false); }
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/work-orders")}>{t("wo.title")}</button>}
        title={data.name}
      >
        <Pill cls={woPill(data.status)}>{data.status || "Draft"}</Pill>
        {writable && data.docstatus === 0 && (
          <>
            <button className="btn ghost" onClick={() => nav(`/work-orders/${encodeURIComponent(name)}/edit`)}>{t("edit")}</button>
            <button className="btn" onClick={() => void doAction("submit")} disabled={busy}>{t("wo.submit")}</button>
          </>
        )}
        {writable && data.docstatus === 1 && (
          <button className="btn ghost" onClick={() => void doAction("cancel")} disabled={busy}>{t("wo.cancel")}</button>
        )}
      </PageHead>
      {actionError ? <ErrorBox error={actionError} /> : null}
      <Card>
        <div className="fg">
          <ReadRow k={t("wo.col.bom")} v={data.bom_no || "—"} />
          <ReadRow k={t("wo.col.item")} v={data.item_name || "—"} />
          <ReadRow k={t("wo.col.qty")} v={`${data.produced_qty ?? 0} / ${data.qty ?? 0}`} />
          <ReadRow k={t("wo.col.start")} v={date(data.planned_start_date)} />
          {data.wip_warehouse ? <ReadRow k={t("wo.col.wip")} v={data.wip_warehouse} /> : null}
          {data.fg_warehouse ? <ReadRow k={t("wo.col.fg")} v={data.fg_warehouse} /> : null}
        </div>
      </Card>
    </>
  );
}
