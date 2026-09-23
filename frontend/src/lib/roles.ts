/** Spec §2 — four SPA roles mapped to Frappe bundles. Viewer cannot submit. */

export type SpaRole = "owner" | "accountant" | "clerk" | "viewer";

export const SPA_ROLES: SpaRole[] = ["owner", "accountant", "clerk", "viewer"];

/**
 * Returns true when the current user is the *application provider* —
 * i.e. the TaxMate SaaS team, not a client employee.
 *
 * Heuristic: `Administrator` always qualifies (Frappe super-user).
 * A `System Manager` without any TaxMate-specific role is also treated as
 * a provider because the client's own owner would have been assigned
 * `TaxMate Owner`.
 */
export function isAppProvider(session: {
  spa_role?: string;
  roles?: string[];
  user?: string;
} | undefined): boolean {
  // Frappe boot user "Administrator" is TaxMate (the SaaS provider), not a client.
  if (session?.user === "Administrator") return true;
  const roles = session?.roles ?? [];
  const hasTaxMateRole = roles.some((r) =>
    ["TaxMate Owner", "TaxMate Accountant", "TaxMate Clerk", "TaxMate Viewer"].includes(r),
  );
  // System Manager without a TaxMate marker = provider staff, not client Owner.
  if (roles.includes("System Manager") && !hasTaxMateRole) return true;
  return false;
}

export function spaRoleOf(session: { spa_role?: string; roles?: string[] } | undefined): SpaRole {
  const direct = session?.spa_role;
  if (direct === "owner" || direct === "accountant" || direct === "clerk" || direct === "viewer") {
    return direct;
  }
  const roles = session?.roles ?? [];
  // Prefer explicit TaxMate markers first, then fall back to ERPNext role bundles.
  if (roles.includes("TaxMate Owner")) return "owner";
  if (roles.includes("TaxMate Accountant")) return "accountant";
  if (roles.includes("TaxMate Clerk")) return "clerk";
  if (roles.includes("TaxMate Viewer")) return "viewer";
  // Provider / super-user falls through as owner for permission checks.
  if (roles.includes("System Manager")) return "owner";
  if (roles.includes("Accounts Manager") || roles.includes("UAE Tax Manager")) return "accountant";
  if (roles.includes("Accounts User")) return "clerk";
  return "viewer";
}

export function canWrite(session: { spa_role?: string; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) !== "viewer";
}

export function canManageUsers(session: { spa_role?: string; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) === "owner";
}

/** True when the user may read and write the Company record (Owner + Provider). */
export function canManageCompany(session: { spa_role?: string; roles?: string[] } | undefined): boolean {
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

