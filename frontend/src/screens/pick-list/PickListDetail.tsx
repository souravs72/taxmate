/**
 * Pick List detail screen.
 * Importers: App.tsx route /pick-lists/:name.
 * API: taxmate.api.resource.get; taxmate.api.workflow.submit/cancel;
 *   taxmate.api.pick_list.set_item_locations.
 * Schema: name, purpose, customer, delivery_note, work_order, status, docstatus,
 *   locations[item_code, item_name, qty, qty_picked, warehouse].
 * User: "Implement the plan… complete all the to-dos."
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales, canCancelSales } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DetailActions from "../../components/DetailActions";
import DocTabShell from "../../components/DocTabShell";
import { useDeleteDraftAction } from "../../lib/useDraftDelete";

type LocationLine = {
  item_code?: string;
  item_name?: string;
  qty?: number;
  qty_picked?: number;
  warehouse?: string;
};

type Doc = {
  name: string;
  purpose?: string;
  customer?: string;
  delivery_note?: string;
  work_order?: string;
  status?: string;
  docstatus?: number;
  locations?: LocationLine[];
};


export default function PickListDetail() {
  const { name = "" } = useParams();
  const deleteAction = useDeleteDraftAction({ doctype: DT.pickList, name, listPath: "/pick-lists" });
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.pickList, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const amendCall = useFrappePostCall<{ message?: { name?: string } }>(METHOD.amend);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const draft = data.docstatus === 0;
  const submitted = data.docstatus === 1;
  const cancelled = data.docstatus === 2;

  async function handleSubmit() {
    setBusy(true); setActionError(null);
    try {
      await submitCall.call({ doc: { doctype: DT.pickList, name } });
      mutate();
    } catch (e) { setActionError(e); } finally { setBusy(false); }
  }

  async function handleCancel() {
    setBusy(true); setActionError(null);
    try {
      await cancelCall.call({ doctype: DT.pickList, name });
      mutate();
    } catch (e) { setActionError(e); } finally { setBusy(false); }
  }

  async function handleAmend() {
    setBusy(true); setActionError(null);
    try {
      const res = await amendCall.call({ doctype: DT.pickList, name });
      const next = res?.message?.name;
      if (next) nav(`/pick-lists/${encodeURIComponent(next)}`);
      else mutate();
    } catch (e) { setActionError(e); } finally { setBusy(false); }
  }


  return (
    <>
      <PageHead
        title={data.name}
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/pick-lists")}>{t("picklist.title")}</button>}
        actions={
          <DetailActions
            doctype={DT.pickList}
            name={name}
            draft={draft}
            submitted={submitted}
            cancelled={cancelled}
            canSubmit={canSubmit}
            canCancel={canCancel}
            canWrite={canSubmit}
            onEdit={() => nav(`/pick-lists/${encodeURIComponent(name)}/edit`)}
            onSubmit={handleSubmit}
            onDelete={deleteAction.onDelete}
            onCancel={handleCancel}
            onAmend={handleAmend}
            busy={busy || deleteAction.loading}
          />
        }
      />

      <DocTabShell doctype={DT.pickList} name={name} doc={data as unknown as Record<string, unknown>}>
        {actionError ? <ErrorBox error={actionError}  /> : null}
      </DocTabShell>
    </>
  );
}
