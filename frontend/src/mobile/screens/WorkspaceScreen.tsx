/** Pick workspace host; continues after app_config.site_ok. */
import { useState, type FormEvent } from "react";

import { t } from "../../i18n/strings";
import { appConfig, MobileApiError, normaliseWorkspace, type AppConfig } from "../api";
import { Alert, Frame } from "../ui";

export default function WorkspaceScreen({
  initial, onDone, onBack,
}: {
  initial?: string | null;
  onDone: (url: string, config: AppConfig) => void;
  onBack?: () => void;
}) {
  const [value, setValue] = useState(() => (initial ?? "").replace(/^https:\/\//, ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const url = normaliseWorkspace(value);
    if (!url) {
      // Well-formed but an IP literal / localhost: say why, not just "invalid".
      setError(normaliseWorkspace(value, true) || /^\[|^(?:https?:\/\/)?[0-9.]+(?::\d+)?\/?$/i.test(value.trim()) ? t("mob.ws.noIp") : t("mob.ws.invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(url, await appConfig(url));
    } catch (err) {
      const down = !(err instanceof MobileApiError) || err.unreachable;
      setError(down ? t("mob.ws.unreachable") : t("mob.ws.notTaxmate"));
      setBusy(false);
    }
  }

  return (
    <Frame brand title={t("mob.ws.title")} sub={t("mob.ws.sub")} onBack={onBack}>
      <form className="mob-form" onSubmit={submit} noValidate>
        <label className="mob-label" htmlFor="mob-ws">{t("mob.ws.label")}</label>
        <div className="mob-url" dir="ltr">
          <span className="mob-url-scheme" aria-hidden="true">https://</span>
          <input
            id="mob-ws"
            className="ctl mob-input"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="url"
            enterKeyHint="go"
            placeholder={t("mob.ws.placeholder")}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            aria-invalid={!!error}
            aria-describedby="mob-ws-hint"
            disabled={busy}
          />
        </div>
        <p className="mob-hint" id="mob-ws-hint">{t("mob.ws.hint")}</p>
        {error && <Alert>{error}</Alert>}
        <button type="submit" className="btn mob-wide" disabled={busy || !value.trim()}>
          {busy ? t("mob.ws.checking") : t("mob.continue")}
        </button>
      </form>
    </Frame>
  );
}
