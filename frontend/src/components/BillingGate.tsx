/**
 * Post-login entitlement gate. Unpaid companies may only open /billing*.
 */
import { Navigate, useLocation } from "react-router-dom";

import { Loading } from "./ui";
import { useSession } from "../lib/session";

export default function BillingGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const loc = useLocation();
  const billing = session.billing;
  const onBilling = loc.pathname === "/billing" || loc.pathname.startsWith("/billing/");

  // Session still hydrating
  if (session.user && billing == null) {
    // get_session always returns billing once wired; treat missing as allow until loaded
  }

  if (!session.user) return <Loading />;

  if (billing?.enabled && billing.can_access === false && !onBilling) {
    return <Navigate to="/billing" replace />;
  }

  return <>{children}</>;
}
