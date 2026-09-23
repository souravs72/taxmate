/**
 * DetailActions — reusable submit/cancel/amend action cluster for detail screens.
 *
 * Callers: InvoiceDetail, PurchaseInvoiceDetail, DeliveryNoteDetail,
 *          PurchaseReceiptDetail, StockEntryDetail, JournalEntryDetail.
 *
 * Renders up to four standard buttons (Edit, Submit, Cancel, Amend) plus an
 * optional extra slot for screen-specific actions (print, receive, return, etc.).
 * All labels are taken from i18n so Arabic works without changes here.
 */
import type { ReactNode } from "react";
import { t } from "../i18n/strings";

export type DetailActionsProps = {
  /** True when docstatus === 0. */
  draft?: boolean;
  /** True when docstatus === 1. */
  submitted?: boolean;
  /** True when docstatus === 2. */
  cancelled?: boolean;
  /** User may submit / amend documents. */
  canSubmit: boolean;
  /** User may cancel documents. */
  canCancel: boolean;
  /** User may create / edit documents. */
  canWrite: boolean;
  /** True while any async action is in flight (disables Submit). */
  busy: boolean;
  /** Navigate to the edit route. Omit to hide the Edit button. */
  onEdit?: () => void;
  /** Call the submit RPC. Omit to hide the Submit button. */
  onSubmit?: () => void;
  /** Call the cancel RPC. Omit to hide the Cancel button. */
  onCancel?: () => void;
  /** Call the amend RPC. Omit to hide the Amend button. */
  onAmend?: () => void;
  /**
   * Extra screen-specific buttons (receive payment, print, credit note, etc.).
   * Rendered between Submit and Cancel.
   */
  extra?: ReactNode;
};

/**
 * Renders the standard Edit | Submit | [extra] | Cancel | Amend button row.
 * Callers place this in the `actions` prop of `<PageHead>`.
 */
export default function DetailActions({
  draft,
  submitted,
  cancelled,
  canSubmit,
  canCancel,
  canWrite,
  busy,
  onEdit,
  onSubmit,
  onCancel,
  onAmend,
  extra,
}: DetailActionsProps) {
  return (
    <>
      {draft && canWrite && onEdit && (
        <button type="button" className="btn ghost" onClick={onEdit}>
          {t("inv.edit")}
        </button>
      )}
      {draft && canSubmit && onSubmit && (
        <button type="button" className="btn" disabled={busy} onClick={onSubmit}>
          {busy ? t("soc.saving") : t("inv.submit")}
        </button>
      )}
      {extra}
      {submitted && canCancel && onCancel && (
        <button type="button" className="btn quiet" disabled={busy} onClick={onCancel}>
          {t("inv.cancel")}
        </button>
      )}
      {cancelled && canSubmit && onAmend && (
        <button type="button" className="btn ghost" disabled={busy} onClick={onAmend}>
          {t("inv.amend")}
        </button>
      )}
    </>
  );
}
