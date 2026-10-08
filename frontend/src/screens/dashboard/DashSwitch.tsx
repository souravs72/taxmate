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
  const companyCount = data?.message?.companies?.length ?? 0;
  const allowed = allowedDashModes(session);
  if (!session.user || !mode || !allowed) return null;
  /* All clients is an accountant view, and only when more than one company
     is mapped. Keep the button while that view is already open. */
  const modes = allowed.filter((m) => m !== "clients" || companyCount > 1 || mode === "clients");
  const pick = (m: DashMode) => {
    if (m === mode) return;
    // The views have different filters; carrying one's over to the other would be meaningless.
    setParams(new URLSearchParams({ as: m }), { replace: false });
  };
  if (modes.length < 2) return null;
  return (
    <div className="seg" role="group" aria-label={t("ad.switch")}>
      {/* "All clients" only means something to someone who has more than one.
          A single-company business never sees a third button. The count comes
          from the list above, so the label is never a number written here. */}
      {modes.map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}>
          {m === "clients"
            ? (companyCount > 0
                ? t("ad.switch.clientsN").replace("{n}", String(companyCount))
                : t("company.allClients"))
            : t(`ad.switch.${m}`)}
        </button>
      ))}
    </div>
  );
}
