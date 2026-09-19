/** Spec §2 — Staff drafts; Accountant/Owner submit, pay, credit, e-invoice. */

const SUBMIT_ROLES = ["Accounts User", "Accounts Manager", "UAE Tax Manager", "System Manager"];
const CANCEL_ROLES = ["Accounts Manager", "UAE Tax Manager", "System Manager"];

export function canSubmitSales(roles: string[] | undefined): boolean {
  return (roles ?? []).some((r) => SUBMIT_ROLES.includes(r));
}

export function canCancelSales(roles: string[] | undefined): boolean {
  return (roles ?? []).some((r) => CANCEL_ROLES.includes(r));
}

export function eInvoiceLocked(status?: string | null): boolean {
  return ["Queued", "Submitted", "Accepted"].includes(status ?? "");
}
