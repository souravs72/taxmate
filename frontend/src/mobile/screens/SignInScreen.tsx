/** Workspace sign-in: email code and/or password (no cookies). */
import { useEffect, useRef, useState, type FormEvent } from "react";

import { t } from "../../i18n/strings";
import {
  appConfig, MobileApiError, passwordLogin, requestCode, verifyCode,
  type AppConfig, type NeedsCode, type SignInResult,
} from "../api";
import { Alert, Frame, tf } from "../ui";

type Step = "email" | "code" | "password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_AFTER = 30;

const USE_CODE: Record<string, string> = {
  PasswordLoginNotAllowedError: "mob.signin.passwordOff",
  PasswordExpiredError: "mob.signin.passwordExpired",
};

function message(err: unknown, fallbackKey: string): string {
  if (err instanceof MobileApiError) {
    if (err.unreachable) return t("mob.err.network");
    // Account lockout: the server's message carries the wait time.
    if (err.excType === "AccountLockedError") return err.message || t("mob.signin.locked");
    // Rate limit, 2FA-without-email-code refusal, disabled login: the server's own words.
    if (err.status !== 401 && err.excType !== "AuthenticationError" && err.message) return err.message;
  }
  return t(fallbackKey);
}

const isNeedsCode = (r: SignInResult | NeedsCode): r is NeedsCode => (r as NeedsCode).needs_code === true;

export default function SignInScreen({
  workspace, config, notice, onSignedIn, onChangeWorkspace, onConfig,
}: {
  workspace: string;
  config: AppConfig | null;
  notice?: string | null;
  onSignedIn: (r: SignInResult) => Promise<void> | void;
  onChangeWorkspace: () => void;
  onConfig: (c: AppConfig) => void;
}) {
  const codeLogin = config?.email_code_login !== false;
  const [step, setStep] = useState<Step>(codeLogin ? "email" : "password");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  /** The code was emailed by the password step (2FA): no resend, back = password. */
  const [viaPassword, setViaPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const host = workspace.replace(/^https:\/\//, "");

  // Refresh the workspace's sign-in options (cold start after logout has none cached).
  useEffect(() => {
    let live = true;
    void appConfig(workspace).then((c) => { if (live) onConfig(c); }, () => { /* keep last known */ });
    return () => { live = false; };
  }, [workspace, onConfig]);

  // Email codes switched off while on the email tab → password tab.
  useEffect(() => {
    if (!codeLogin && step === "email") setStep("password");
  }, [codeLogin, step]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const emailOk = EMAIL_RE.test(email.trim());

  function go(next: Step, keepInfo: string | null = null) {
    setStep(next);
    setError(null);
    setInfo(keepInfo);
    setPassword("");
    setCode("");
    if (next !== "code") { setChallenge(null); setViaPassword(false); }
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!emailOk) { setError(t("mob.signin.emailInvalid")); return; }
    setBusy(true);
    setError(null);
    try {
      const ch = await requestCode(workspace, email.trim());
      setChallenge(ch);
      setViaPassword(false);
      setInfo(step === "code" ? t("mob.code.sent") : null);
      setStep("code");
      setCode("");
      setWait(RESEND_AFTER);
    } catch (err) {
      if (err instanceof MobileApiError && err.excType === "EmailCodeLoginDisabledError") {
        onConfig({ ...(config ?? {}), email_code_login: false });
        go("password", t("mob.signin.codeOff"));
      } else {
        setError(message(err, "mob.err.generic"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function finish(run: () => Promise<SignInResult | NeedsCode>, failKey: string) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const r = await run();
      if (isNeedsCode(r)) {
        // 2FA user: password accepted, a code is on its way for this challenge.
        setBusy(false);
        setPassword("");
        setChallenge(r.challenge);
        setViaPassword(true);
        setCode("");
        setStep("code");
        return;
      }
      if (!r?.token) throw new MobileApiError("", 500);
      await onSignedIn(r);
    } catch (err) {
      setBusy(false);
      const exc = err instanceof MobileApiError ? err.excType : undefined;
      if (exc === "PasswordRequiredError") {
        go("password", t("mob.signin.passwordRequired"));
        return;
      }
      const useCode = exc ? USE_CODE[exc] : undefined;
      if (useCode && codeLogin) {
        // Switch to the email-code tab, keeping the address they typed.
        go("email", t(useCode));
        return;
      }
      // Password refused and email codes are off too: nothing left to try in the app.
      setError(useCode ? t("mob.signin.allOff") : message(err, failKey));
      if (step === "code") { setCode(""); codeRef.current?.focus(); }
    }
  }

  function submitCode(e?: FormEvent, value = code) {
    e?.preventDefault();
    if (busy || value.length !== 6 || !challenge) return;
    const ch = challenge;
    void finish(() => verifyCode(workspace, ch, value), "mob.code.invalid");
  }

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!emailOk) { setError(t("mob.signin.emailInvalid")); return; }
    if (!password) return;
    void finish(() => passwordLogin(workspace, email.trim(), password), "mob.signin.badLogin");
  }

  const wsLine = (
    <div className="mob-ws">
      <span className="mob-ws-k">{t("mob.signin.workspace")}</span>
      <bdi className="mob-ws-v" dir="ltr">{host}</bdi>
      <button type="button" className="mob-link" onClick={onChangeWorkspace} disabled={busy}>{t("mob.ws.change")}</button>
    </div>
  );

  const emailField = (
    <>
      <label className="mob-label" htmlFor="mob-email">{t("mob.signin.email")}</label>
      <input
        id="mob-email"
        className="ctl mob-input"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        dir="ltr"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null); }}
        disabled={busy}
        enterKeyHint={step === "password" ? "next" : "send"}
      />
    </>
  );

  const landing: Step = codeLogin ? "email" : "password";
  const notices = info && step !== "code" ? <Alert kind="info">{info}</Alert>
    : notice && step === landing ? <Alert kind="info">{notice}</Alert>
    : null;

  if (step === "code") {
    return (
      <Frame
        title={t("mob.code.title")}
        sub={tf(viaPassword ? "mob.code.subPassword" : "mob.code.sub", { email: "\u2068" + email.trim() + "\u2069" })}
        onBack={() => go(viaPassword ? "password" : "email")}
      >
        <form className="mob-form" onSubmit={submitCode} noValidate>
          <label className="mob-label" htmlFor="mob-code">{t("mob.code.label")}</label>
          <input
            id="mob-code"
            ref={codeRef}
            className="ctl mob-input mob-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              setError(null);
              if (v.length === 6) submitCode(undefined, v);
            }}
            disabled={busy}
            aria-invalid={!!error}
          />
          {error && <Alert>{error}</Alert>}
          {info && !error && <Alert kind="ok">{info}</Alert>}
          <button type="submit" className="btn mob-wide" disabled={busy || code.length !== 6}>
            {busy ? t("mob.code.verifying") : t("mob.code.verify")}
          </button>
          <p className="mob-hint">{t("mob.code.noMail")}</p>
          <div className="mob-links">
            {!viaPassword && (
              <button type="button" className="mob-link" disabled={busy || wait > 0} onClick={() => void sendCode()}>
                {wait > 0 ? tf("mob.code.resendIn", { s: wait }) : t("mob.code.resend")}
              </button>
            )}
            <button type="button" className="mob-link" disabled={busy} onClick={() => go(viaPassword ? "password" : "email")}>
              {viaPassword ? t("mob.back") : t("mob.code.otherEmail")}
            </button>
          </div>
        </form>
      </Frame>
    );
  }

  if (step === "password") {
    return (
      <Frame
        brand={!codeLogin}
        title={t("mob.signin.title")}
        sub={t("mob.signin.subPassword")}
        onBack={codeLogin ? () => go("email") : undefined}
        notice={notices}
      >
        {wsLine}
        <form className="mob-form" onSubmit={submitPassword} noValidate>
          {emailField}
          <label className="mob-label" htmlFor="mob-pw">{t("mob.signin.password")}</label>
          <div className="mob-pw">
            <input
              id="mob-pw"
              className="ctl mob-input"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              disabled={busy}
              enterKeyHint="go"
            />
            <button
              type="button"
              className="iconbtn mob-pw-eye"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? t("mob.signin.hidePassword") : t("mob.signin.showPassword")}
              aria-pressed={showPw}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10z" />
                <circle cx="10" cy="10" r="2.5" />
                {showPw && <path d="M3 17L17 3" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
          {error && <Alert>{error}</Alert>}
          <button type="submit" className="btn mob-wide" disabled={busy || !email.trim() || !password}>
            {busy ? t("mob.signin.signingIn") : t("mob.signin.submit")}
          </button>
          {codeLogin && (
            <div className="mob-links">
              <button type="button" className="mob-link" disabled={busy} onClick={() => go("email")}>
                {t("mob.signin.useCode")}
              </button>
            </div>
          )}
        </form>
      </Frame>
    );
  }

  return (
    <Frame brand title={t("mob.signin.title")} sub={t("mob.signin.sub")} notice={notices}>
      {wsLine}
      <form className="mob-form" onSubmit={sendCode} noValidate>
        {emailField}
        {error && <Alert>{error}</Alert>}
        <button type="submit" className="btn mob-wide" disabled={busy || !email.trim()}>
          {busy ? t("mob.signin.sending") : t("mob.signin.sendCode")}
        </button>
        <div className="mob-links">
          <button type="button" className="mob-link" disabled={busy} onClick={() => go("password")}>
            {t("mob.signin.usePassword")}
          </button>
        </div>
      </form>
    </Frame>
  );
}
