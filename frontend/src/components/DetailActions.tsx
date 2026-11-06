/**
 * DetailActions — reusable submit/cancel/amend/delete action cluster for detail screens.
 *
 * Callers: InvoiceDetail, PurchaseInvoiceDetail, DeliveryNoteDetail,
 *          PurchaseReceiptDetail, StockEntryDetail, JournalEntryDetail,
 *          SalesOrderDetail, QuotationDetail, PurchaseOrderDetail, …
 *
 * Order mirrors Desk: Create | History | Edit | Submit | Delete | [extra] | Menu | Cancel | Amend.
 * Put make/create links in `create`, status/secondary in `menu`, Print etc. in `extra`.
 */
import type { ReactNode } from "react";
import { t } from "../i18n/strings";
import { confirmCancel } from "../lib/workflow";
import { CreateMenu, MenuActions, type ActionItem } from "./ActionMenu";
import DocHistory from "./DocHistory";

export type { ActionItem };

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
  /** User may create / edit / delete draft documents. */
  canWrite: boolean;
  /** True while any async action is in flight (disables Submit/Delete). */
  busy: boolean;
  /** Navigate to the edit route. Omit to hide the Edit button. */
  onEdit?: () => void;
  /** Call the submit RPC. Omit to hide the Submit button. */
  onSubmit?: () => void;
  /** Delete draft via taxmate.api.resource.delete. Omit to hide. */
  onDelete?: () => void;
  /** Call the cancel RPC. Omit to hide the Cancel button. */
  onCancel?: () => void;
  /** Call the amend RPC. Omit to hide the Amend button. */
  onAmend?: () => void;
  /**
   * Desk Create dropdown (custom_make_buttons). Prefer this over a flat
   * row of make/create buttons in `extra`.
   */
  create?: ActionItem[];
  /** Desk Menu dropdown for secondary / status actions. */
  menu?: ActionItem[];
  /**
   * Remaining screen-specific controls that stay visible (print, hold reason
   * input). Prefer `create` / `menu` for labelled actions.
   */
  extra?: ReactNode;
  /** When set with `name`, shows the shared History control. */
  doctype?: string;
  name?: string;
  /** Workflow transitions available from Frappe Workflow engine. */
  workflowTransitions?: { action: string; next_state?: string }[];
  /** Handler when user executes a workflow action. */
  onWorkflowAction?: (action: string) => void;
};

/**
 * Renders Create | History | Edit | Workflow Actions / Submit | Delete | [extra] | Menu | Cancel | Amend.
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
  onDelete,
  onCancel,
  onAmend,
  create,
  menu,
  extra,
  doctype,
  name,
  workflowTransitions,
  onWorkflowAction,
}: DetailActionsProps) {
  function run(action: () => void | Promise<unknown>) {
    void Promise.resolve(action()).catch(() => undefined);
  }
  return (
    <>
      {create?.length ? <CreateMenu items={create} /> : null}
      {doctype && name ? <DocHistory doctype={doctype} name={name} /> : null}
      {draft && canWrite && onEdit && (
        <button type="button" className="btn ghost" onClick={onEdit}>
          {t("inv.edit")}
        </button>
      )}
      {workflowTransitions && workflowTransitions.length > 0 ? (
        workflowTransitions.map((wt) => (
          <button
            key={wt.action}
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => onWorkflowAction?.(wt.action)}
          >
            {wt.action}
          </button>
        ))
      ) : (
        draft && canSubmit && onSubmit && (
          <button type="button" className="btn" disabled={busy} onClick={() => run(onSubmit)}>
            {busy ? t("soc.saving") : t("inv.submit")}
          </button>
        )
      )}
      {draft && canWrite && canCancel && onDelete && (
        <button type="button" className="btn quiet" disabled={busy} onClick={onDelete}>
          {busy ? t("soc.saving") : t("inv.delete")}
        </button>
      )}
      {extra}
      {menu?.length ? <MenuActions items={menu} /> : null}
      {submitted && canCancel && onCancel && (
        <button
          type="button"
          className="btn quiet"
          disabled={busy}
          onClick={() => {
            if (!confirmCancel(name)) return;
            run(onCancel);
          }}
        >
          {busy ? t("soc.saving") : t("inv.cancel")}
        </button>
      )}
      {cancelled && canSubmit && onAmend && (
        <button type="button" className="btn ghost" disabled={busy} onClick={() => run(onAmend)}>
          {t("inv.amend")}
        </button>
      )}
    </>
  );
}
