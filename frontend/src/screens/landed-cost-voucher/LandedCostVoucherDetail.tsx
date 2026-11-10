/**
 * Landed Cost Voucher detail. Route: /landed-cost-vouchers/:name
 * API: useDoc on "Landed Cost Voucher". Submit/cancel via workflow.
 * Callers: App.tsx. Phase 8.
 */
import { useParams, useNavigate, Link } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";
import { DT, METHOD } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales, canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Loading, ErrorBox, PageHead, Pill } from "../../components/ui";
import DetailActions from "../../components/DetailActions";
import DocTabShell from "../../components/DocTabShell";
import { useDeleteDraftAction } from "../../lib/useDraftDelete";
import { useState } from "react";

export default function LandedCostVoucherDetail() {
  const { name = "" } = useParams();
  const deleteAction = useDeleteDraftAction({ doctype: DT.landedCostVoucher, name, listPath: "/landed-cost-vouchers" });
  const nav = useNavigate();
  const session = useSession();
  const doc = useDoc<Record<string, unknown>>(DT.landedCostVoucher, name, name);
  const submitCall = useFrappePostCall(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const amendCall = useFrappePostCall<{ message?: { name?: string } }>(METHOD.amend);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (doc.isLoading) return <Loading />;
  if (doc.error) return <ErrorBox error={doc.error} onRetry={() => doc.mutate()} />;
  const d = doc.data ?? {};
  const docstatus = Number(d.docstatus ?? 0);
  const isDraft = docstatus === 0;
  const isSubmitted = docstatus === 1;
  const canSubmitDoc = canSubmitSales(session.roles);
  const canCancelDoc = canCancelSales(session.roles);

  async function doAction(action: "submit" | "cancel") {
    setBusy(true); setErr(null);
    try {
      if (action === "submit") {
        await submitCall.call({ doc: { doctype: DT.landedCostVoucher, name } });
      } else {
        await cancelCall.call({ doctype: DT.landedCostVoucher, name });
      }
      await doc.mutate();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  async function amend() {
    setBusy(true); setErr(null);
    try {
      const res = await amendCall.call({ doctype: DT.landedCostVoucher, name });
      const next = res?.message?.name;
      if (next) nav(`/landed-cost-vouchers/${encodeURIComponent(next)}`);
      else await doc.mutate();
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }


  const statusCls = docstatus === 1 ? "p-submitted" : docstatus === 2 ? "p-cancelled" : "p-draft";
  const statusLabel = docstatus === 1 ? t("status.Submitted") : docstatus === 2 ? t("status.Cancelled") : t("status.Draft");

  return (
    <>
      <PageHead
        title={name}
        eyebrow={<Link to="/landed-cost-vouchers">{t("lcv.title")}</Link>}
        actions={
          <>
            <Pill cls={statusCls}>{statusLabel}</Pill>
            <DetailActions
            doctype={DT.landedCostVoucher}
            name={name}
              draft={isDraft}
              submitted={isSubmitted}
              cancelled={docstatus === 2}
              canWrite={canWrite(session)}
              canSubmit={canSubmitDoc}
              canCancel={canCancelDoc}
              onEdit={isDraft ? () => nav(`/landed-cost-vouchers/${encodeURIComponent(name)}/edit`) : undefined}
              onSubmit={isDraft ? () => doAction("submit") : undefined}
            onDelete={deleteAction.onDelete}
              onCancel={isSubmitted ? () => doAction("cancel") : undefined}
              onAmend={docstatus === 2 ? amend : undefined}
              busy={busy || deleteAction.loading}
            />
          </>
        }
      />

      <DocTabShell doctype={DT.landedCostVoucher} name={name} doc={d as unknown as Record<string, unknown>}>
        {err ? <ErrorBox error={err}  /> : null}
      </DocTabShell>
    </>
  );
}
