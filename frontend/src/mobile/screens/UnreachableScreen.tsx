/** Offline / 5xx after unlock — credentials kept until sign-out. */
import { useState } from "react";

import { t } from "../../i18n/strings";
import { Frame, tf } from "../ui";

export default function UnreachableScreen({
  workspace, onRetry, onSignOut,
}: {
  workspace: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const host = workspace.replace(/^https:\/\//, "");
  return (
    <Frame
      title={tf("mob.unreach.title", { host: "⁨" + host + "⁩" })}
      sub={t("mob.unreach.sub")}
      foot={
        <button type="button" className="mob-link" onClick={onSignOut} disabled={busy}>
          {t("mob.lock.signOut")}
        </button>
      }
    >
      <div className="mob-bio-hero" aria-hidden="true">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0" strokeLinecap="round" />
          <path d="M3 3l18 18" strokeLinecap="round" />
          <circle cx="12" cy="19" r="1" fill="currentColor" />
        </svg>
      </div>
      <div className="mob-form">
        <button
          type="button"
          className="btn mob-wide"
          disabled={busy}
          onClick={() => { setBusy(true); onRetry(); }}
        >
          {busy ? t("mob.unreach.retrying") : t("mob.unreach.retry")}
        </button>
      </div>
    </Frame>
  );
}
