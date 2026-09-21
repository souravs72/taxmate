/** Spec §2 — four SPA roles mapped to Frappe bundles. Viewer cannot submit. */

export type SpaRole = "owner" | "accountant" | "clerk" | "viewer";

export const SPA_ROLES: SpaRole[] = ["owner", "accountant", "clerk", "viewer"];

export function spaRoleOf(session: { spa_role?: string; roles?: string[] } | undefined): SpaRole {
  const direct = session?.spa_role;
  if (direct === "owner" || direct === "accountant" || direct === "clerk" || direct === "viewer") {
    return direct;
  }
  const roles = session?.roles ?? [];
  if (roles.includes("System Manager") || roles.includes("TaxMate Owner")) return "owner";
  if (roles.includes("TaxMate Accountant") || roles.includes("Accounts Manager") || roles.includes("UAE Tax Manager")) {
    return "accountant";
  }
  if (roles.includes("TaxMate Clerk") || roles.includes("Accounts User")) return "clerk";
  return "viewer";
}

export function canWrite(session: { spa_role?: string; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) !== "viewer";
}

export function canManageUsers(session: { spa_role?: string; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) === "owner";
}

export function canViewTeam(session: { spa_role?: string; roles?: string[] } | undefined): boolean {
  const spa = spaRoleOf(session);
  return spa === "owner" || spa === "accountant";
}

const SUBMIT_ROLES = ["Accounts User", "Accounts Manager", "UAE Tax Manager", "System Manager"];
const CANCEL_ROLES = ["Accounts Manager", "UAE Tax Manager", "System Manager"];

export function canSubmitSales(roles: string[] | undefined): boolean {
  const spa = spaRoleOf({ roles });
  if (spa === "viewer") return false;
  if (spa === "owner" || spa === "accountant" || spa === "clerk") return true;
  return (roles ?? []).some((r) => SUBMIT_ROLES.includes(r));
}

export function canCancelSales(roles: string[] | undefined): boolean {
  const spa = spaRoleOf({ roles });
  if (spa === "owner" || spa === "accountant") return true;
  if (spa === "clerk" || spa === "viewer") return false;
  return (roles ?? []).some((r) => CANCEL_ROLES.includes(r));
}

export function eInvoiceLocked(status?: string | null): boolean {
  return ["Queued", "Submitted", "Accepted"].includes(status ?? "");
}

