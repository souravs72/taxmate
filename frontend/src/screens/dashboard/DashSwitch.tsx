/**
 * Owner / Accountant switch on the home screen.
 *
 * The choice lives in the URL (?as=owner|accountant) so it can be shared as a
 * link. With no parameter, accountants and clerks land on the accountant view
 * and everyone else on the owner view. Anyone can switch: each section still
 * checks the user's permissions on the server.
 */

import { useSearchParams } from "react-router-dom";

import { useSession } from "../../lib/session";
import { spaRoleOf } from "../../lib/roles";
import { t } from "../../i18n/strings";

export type DashMode = "owner" | "accountant";

export function useDashMode(): DashMode {
  const [params] = useSearchParams();
  const session = useSession();
  const asked = params.get("as");
  if (asked === "owner" || asked === "accountant") return asked;
  const role = spaRoleOf(session);
  return role === "accountant" || role === "clerk" ? "accountant" : "owner";
}

export function DashSwitch() {
  const mode = useDashMode();
  const [, setParams] = useSearchParams();
  const pick = (m: DashMode) => {
    if (m === mode) return;
    // The two views have different filters; carrying one's over to the other would be meaningless.
    setParams(new URLSearchParams({ as: m }), { replace: false });
  };
  return (
    <div className="seg" role="group" aria-label={t("ad.switch")}>
      {(["owner", "accountant"] as DashMode[]).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => pick(m)}>
          {t(`ad.switch.${m}`)}
        </button>
      ))}
    </div>
  );
}
