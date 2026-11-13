/**
 * Topbar trial / paywall chip.
 */
import { Link } from "react-router-dom";

import { useSession } from "../lib/session";

export default function TrialStatusChip() {
  const session = useSession();
  const b = session.billing;
  if (!b?.enabled) return null;

  const onTrial = b.status === "Trial" && (b.days_left ?? 0) > 0;
  const needsPay = b.can_access === false;
  if (!onTrial && !needsPay) return null;

  const label = needsPay
    ? "Trial ended"
    : b.days_left === 1
      ? "Trial · 1 day"
      : `Trial · ${b.days_left ?? 0} days`;

  return (
    <Link
      to="/billing"
      className={`tm-trial-chip${needsPay ? " ended" : ""}`}
      title={needsPay ? "Subscribe to continue" : "Trial ends soon"}
    >
      <span className="tm-trial-dot" aria-hidden="true" />
      {label}
    </Link>
  );
}
