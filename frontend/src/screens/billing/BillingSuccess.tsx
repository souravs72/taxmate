/**
 * Post-Stripe return. Refresh session billing, then continue.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { Loading } from "../../components/ui";
import { METHOD } from "../../lib/frappe";

export default function BillingSuccess() {
  const status = useFrappeGetCall(METHOD.getBillingStatus, undefined, "tm-bill-success", {
    revalidateOnFocus: true,
  });
  const session = useFrappeGetCall(METHOD.getSession, undefined, "tm-session-refresh");

  useEffect(() => {
    void status.mutate();
    void session.mutate();
  }, []);

  if (status.isLoading && !status.data) return <Loading />;

  const canAccess = Boolean(status.data?.message?.can_access);

  return (
    <div className="tm-billing">
      <div className="tm-bill-hero">
        <h1 className="tm-billing-title">{canAccess ? "Subscribed" : "Payment received"}</h1>
        <p className="tm-billing-sub">
          {canAccess ? "Your plan is active." : "Confirming payment. Refresh if access is still locked."}
        </p>
        <div className="tm-billing-actions" style={{ marginTop: 24, display: "flex", gap: 10, justifyContent: "center" }}>
          <Link className="btn" to="/">
            Continue
          </Link>
          {!canAccess ? (
            <button type="button" className="btn ghost" onClick={() => void status.mutate()}>
              Refresh
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
