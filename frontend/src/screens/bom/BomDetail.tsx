/**
 * BomDetail — Phase 18. BOM read-only detail.
 * Callers: App.tsx /boms/:name
 */
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales, canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DetailActions from "../../components/DetailActions";
import DocTabShell from "../../components/DocTabShell";
import { useDeleteDraftAction } from "../../lib/useDraftDelete";

type BomItem = { item_code?: string; item_name?: string; qty?: number; uom?: string; rate?: number; amount?: number };
type Doc = { name: string; item?: string; item_name?: string; quantity?: number; is_active?: number; is_default?: number; docstatus?: number; items?: BomItem[] };

export default function BomDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const deleteAction = useDeleteDraftAction({ doctype: DT.bom, name, listPath: "/boms" });
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.bom, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const amendCall = useFrappePostCall<{ message?: { name?: string } }>(METHOD.amend);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/boms")}>{t("bom.title")}</button>}
        title={data.name}
        actions={
          <DetailActions
            doctype={DT.bom}
            name={name}
            draft={data.docstatus === 0}
            submitted={data.docstatus === 1}
            cancelled={data.docstatus === 2}
            canWrite={writable}
            canSubmit={canSubmitSales(session.roles)}
            canCancel={canCancelSales(session.roles)}
            busy={submitCall.loading || cancelCall.loading || amendCall.loading || deleteAction.loading}
            onEdit={() => nav(`/boms/${encodeURIComponent(name)}/edit`)}
            onSubmit={() => {
              void submitCall.call({ doc: { doctype: DT.bom, name } }).then(() => mutate()).catch(() => undefined);
            }}
            onDelete={deleteAction.onDelete}
            onCancel={() => {
              void cancelCall.call({ doctype: DT.bom, name }).then(() => mutate()).catch(() => undefined);
            }}
            onAmend={() => {
              void amendCall.call({ doctype: DT.bom, name }).then((res) => {
                const next = res?.message?.name;
                if (next) nav(`/boms/${encodeURIComponent(next)}`);
                else mutate();
              }).catch(() => undefined);
            }}
          />
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          {data.is_active ? <Pill cls="p-done">{t("bom.activeLabel")}</Pill> : <Pill cls="p-flat">{t("no")}</Pill>}
        </p>
      </PageHead>

      <DocTabShell doctype={DT.bom} name={name} doc={data as unknown as Record<string, unknown>}>
        {(submitCall.error || cancelCall.error || amendCall.error || deleteAction.error) && (
        <ErrorBox error={submitCall.error || cancelCall.error || amendCall.error || deleteAction.error} />
      )}
      </DocTabShell>
    </>
  );
}
