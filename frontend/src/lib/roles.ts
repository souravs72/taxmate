/** Spec §2 — SPA roles mapped to Frappe markers. Multiple markers → DocPerm union. */

export type SpaRole = "owner" | "accountant" | "clerk" | "viewer";

export const SPA_ROLES: SpaRole[] = ["owner", "accountant", "clerk", "viewer"];

export const POS_ADDON_ROLES = ["POSNext Cashier", "Nexus POS Manager"] as const;
export type PosAddonRole = (typeof POS_ADDON_ROLES)[number];

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
  spa_roles?: string[];
  roles?: string[];
  user?: string;
} | undefined): boolean {
  if (session?.user === "Administrator") return true;
  const roles = session?.roles ?? [];
  const hasTaxMateRole = roles.some((r) =>
    ["TaxMate Owner", "TaxMate Accountant", "TaxMate Clerk", "TaxMate Viewer"].includes(r),
  );
  if (roles.includes("System Manager") && !hasTaxMateRole) return true;
  return false;
}

export function spaRolesOf(session: {
  spa_role?: string;
  spa_roles?: string[];
  roles?: string[];
} | undefined): SpaRole[] {
  const listed = session?.spa_roles?.filter(
    (r): r is SpaRole => r === "owner" || r === "accountant" || r === "clerk" || r === "viewer",
  );
  if (listed && listed.length) return listed;

  const roles = session?.roles ?? [];
  const found: SpaRole[] = [];
  if (roles.includes("TaxMate Owner") || roles.includes("System Manager")) found.push("owner");
  if (roles.includes("TaxMate Accountant")) found.push("accountant");
  if (roles.includes("TaxMate Clerk")) found.push("clerk");
  if (roles.includes("TaxMate Viewer")) found.push("viewer");
  if (found.length) return found;
  if (roles.includes("Accounts Manager") || roles.includes("UAE Tax Manager")) return ["accountant"];
  if (roles.includes("Accounts User")) return ["clerk"];
  const direct = session?.spa_role;
  if (direct === "owner" || direct === "accountant" || direct === "clerk" || direct === "viewer") {
    return [direct];
  }
  return ["viewer"];
}

export function spaRoleOf(session: {
  spa_role?: string;
  spa_roles?: string[];
  roles?: string[];
} | undefined): SpaRole {
  return spaRolesOf(session)[0] ?? "viewer";
}

export function canWrite(session: { spa_role?: string; spa_roles?: string[]; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) !== "viewer";
}

export function canManageUsers(session: { spa_role?: string; spa_roles?: string[]; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) === "owner";
}

/** True when the user may read and write the Company record (Owner + Provider). */
export function canManageCompany(session: { spa_role?: string; spa_roles?: string[]; roles?: string[] } | undefined): boolean {
  return spaRoleOf(session) === "owner";
}

export function canViewTeam(session: { spa_role?: string; spa_roles?: string[]; roles?: string[] } | undefined): boolean {
  const spa = spaRoleOf(session);
  return spa === "owner" || spa === "accountant";
}

export function canOpenPosNext(session: {
  spa_role?: string;
  spa_roles?: string[];
  roles?: string[];
  extra_roles?: string[];
} | undefined): boolean {
  if (spaRoleOf(session) === "owner") return true;
  const roles = session?.roles ?? [];
  const extras = session?.extra_roles ?? [];
  return (
    roles.includes("POSNext Cashier")
    || roles.includes("Nexus POS Manager")
    || extras.includes("POSNext Cashier")
    || extras.includes("Nexus POS Manager")
  );
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
