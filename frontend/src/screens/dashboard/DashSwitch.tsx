/**
 * Home-screen switch. The choice lives in the URL (?as=) so it can be shared.
 * Which buttons exist comes from allowedDashModes: an owner stays on the owner
 * view, an accountant may open owner + books + All clients, a clerk stays on
 * the accountant view. The server rejects a view the role cannot open.
 */

import { useSearchParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { allowedDashModes, type HomeView } from "../../lib/roles";
import { t } from "../../i18n/strings";

export type DashMode = HomeView;

export function useDashMode(): DashMode | null {
  const [params] = useSearchParams();
  const session = useSession();
  const allowed = allowedDashModes(session);
  // Session has not loaded. Guessing "owner" would fetch the owner dashboard
  // for an accountant.
  if (!allowed) return null;
  const asked = params.get("as");
  if (asked && allowed.includes(asked as DashMode)) return asked as DashMode;
  return allowed[0] ?? "owner";
}

export function DashSwitch() {
  const mode = useDashMode();
  const session = useSession();
  const [, setParams] = useSearchParams();
  /* The same SWR key the header company switcher uses, so this is a cache hit
     rather than a second request — that list is already in flight for the top
     bar on every screen. */
  const { data } = useFrappeGetCall<{ message: { companies: unknown[] } }>(
    METHOD.listMyCompanies,
    undefined,
    session.user ? `my-companies-${session.user}` : null,
  );
  const companies = data?.message?.companies;
  const companyCount = companies?.length ?? 0;
  const allowed = allowedDashModes(session);
  if (!session.user || !mode || !allowed) return null;
  // A business owner has allowed.length === 1 ("owner") -> never show switcher.
  // An accountant has allowed.length === 3 ("accountant", "owner", "clients").
  if (allowed.length < 2) return null;

  const pick = (m: DashMode) => {
    if (m === mode) return;
    // Replace so switching views does not stack history (back/forward thrash).
    // Each view has its own filters; do not carry period/month across.
    setParams(new URLSearchParams({ as: m }), { replace: true });
  };

  return (
    <div className="seg dash-seg" role="group" aria-label={t("ad.switch")}>
      {allowed.map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}>
          {m === "clients"
            ? (companyCount > 1
                ? t("ad.switch.clientsN").replace("{n}", String(companyCount))
                : t("company.allClients"))
            : t(`ad.switch.${m}`)}
        </button>
      ))}
    </div>
  );
}
