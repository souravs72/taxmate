/** Capacitor shell: workspace → sign-in → PIN → App with TaxMate token auth. */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import { FrappeContext, FrappeProvider, type TokenParams } from "frappe-react-sdk";

import App from "../App";
import { t } from "../i18n/strings";
import { useLang } from "../lib/i18n";
import { revokeQuietly, serverLogout, type AppConfig, type SignInResult } from "./api";
import { biometryKind, type BioKind } from "./biometric";
import { hideSplash, watchResume } from "./lock";
import { hasPin } from "./pin";
import { MOBILE_SIGNAL, type MobileSignal } from "./platform";
import { getToken, getWorkspace, setTokenMem, setWorkspaceMem } from "./session";
import {
  clearSession, firstLaunchWipe, loadBioEnabled, loadIdentity, loadTokenRecord, loadWorkspace,
  saveBioEnabled, saveIdentity, saveTokenRecord, saveWorkspace,
} from "./storage";
import WorkspaceScreen from "./screens/WorkspaceScreen";
import SignInScreen from "./screens/SignInScreen";
import { BioOfferScreen, CreatePinScreen, LockScreen } from "./screens/PinScreens";
import UnreachableScreen from "./screens/UnreachableScreen";

import "./mobile.css";

type Phase =
  | { k: "boot" }
  | { k: "workspace"; back: boolean }
  | { k: "signin"; notice?: string | null }
  | { k: "createPin" }
  | { k: "offerBio"; kind: BioKind }
  | { k: "locked" }
  | { k: "app" }
  | { k: "unreachable" }
  | { k: "busy"; label: string };

const TOKEN_PARAMS: TokenParams = {
  useToken: true,
  type: "TaxMate" as TokenParams["type"],
  token: () => getToken() ?? "",
};

export default function MobileRoot() {
  useLang();
  const [phase, setPhase] = useState<Phase>({ k: "boot" });
  const [overlay, setOverlay] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [bio, setBio] = useState<BioKind>("none");
  const [session, setSession] = useState(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const ending = useRef(false);
  const phaseRef = useRef<Phase["k"]>("boot");
  phaseRef.current = phase.k;

  const lockBio = useCallback(async () => {
    const on = await loadBioEnabled();
    setBio(on ? await biometryKind() : "none");
  }, []);

  useEffect(() => {
    void (async () => {
      const leftover = await firstLaunchWipe();
      if (leftover) revokeQuietly(leftover.origin, leftover.token);
      const ws = await loadWorkspace();
      setWorkspaceMem(ws);
      if (!ws) return setPhase({ k: "workspace", back: false });
      const rec = await loadTokenRecord();
      if (!rec) return setPhase({ k: "signin" });
      if (rec.origin !== ws) {
        revokeQuietly(rec.origin, rec.token);
        await clearSession();
        return setPhase({ k: "signin" });
      }
      if (!(await hasPin())) {
        revokeQuietly(ws, rec.token);
        await clearSession();
        return setPhase({ k: "signin" });
      }
      const token = rec.token;
      setTokenMem(token);
      const id = await loadIdentity();
      setName(id.fullName || id.user);
      await lockBio();
      setPhase({ k: "locked" });
    })().finally(hideSplash);
  }, [lockBio]);

  const endSession = useCallback(async (notice: string | null, revoke: boolean) => {
    if (ending.current) return;
    ending.current = true;
    setPhase({ k: "busy", label: t("mob.signingOut") });
    setOverlay(false);
    const ws = getWorkspace();
    const token = getToken();
    if (revoke && ws && token) {
      await serverLogout(ws, token).catch(() => {});
    }
    setTokenMem(null);
    await clearSession().catch(() => {});
    setName(null);
    setBio("none");
    setSession((n) => n + 1);
    ending.current = false;
    setPhase({ k: "signin", notice });
  }, []);

  useEffect(() => {
    function onSignal(e: Event) {
      const kind = (e as CustomEvent<MobileSignal>).detail;
      if (!getToken()) return;
      if (kind === "logout") void endSession(t("mob.signin.signedOut"), true);
      if (kind === "auth-lost") void endSession(t("mob.signin.ended"), false);
      if (kind === "unreachable" && !ending.current) setPhase((p) => (p.k === "app" ? { k: "unreachable" } : p));
      if (kind === "reload" && !ending.current && phaseRef.current === "app") setSession((n) => n + 1);
    }
    window.addEventListener(MOBILE_SIGNAL, onSignal);
    return () => window.removeEventListener(MOBILE_SIGNAL, onSignal);
  }, [endSession]);

  const watching = phase.k === "app" || phase.k === "unreachable";
  useEffect(() => {
    if (!watching) return;
    return watchResume(() => {
      void lockBio().then(() => {
        setPhase((p) => (p.k === "unreachable" ? { k: "locked" } : p));
        setOverlay((o) => o || phaseRef.current === "app");
      });
    });
  }, [watching, lockBio]);

  const onLockSignOut = useCallback((why: "lockout" | "forgot") => {
    void endSession(why === "lockout" ? t("mob.signin.lockedOut") : null, true);
  }, [endSession]);

  const onSignedIn = useCallback(async (r: SignInResult) => {
    await saveTokenRecord({ origin: getWorkspace() ?? "", token: r.token });
    await saveIdentity(r.user, r.full_name ?? null);
    setTokenMem(r.token);
    setName(r.full_name || r.user);
    setSession((n) => n + 1);
    setPhase({ k: "createPin" });
  }, []);

  const afterPin = useCallback(async () => {
    const kind = await biometryKind();
    setPhase(kind === "none" ? { k: "app" } : { k: "offerBio", kind });
  }, []);

  const swrConfig = useMemo(
    () => ({
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      provider: () => new Map(),
    }),
    [session],
  );

  switch (phase.k) {
    case "boot":
      return <div className="mob-screen mob-center" aria-busy="true" />;
    case "busy":
      return <div className="mob-screen mob-center"><p className="mob-hint" role="status">{phase.label}</p></div>;
    case "workspace":
      return (
        <WorkspaceScreen
          initial={getWorkspace()}
          onBack={phase.back ? () => setPhase({ k: "signin" }) : undefined}
          onDone={(url, cfg) => {
            setConfig(cfg);
            void saveWorkspace(url).then(() => {
              setWorkspaceMem(url);
              setPhase({ k: "signin" });
            });
          }}
        />
      );
    case "signin":
      return (
        <SignInScreen
          workspace={getWorkspace() ?? ""}
          config={config}
          notice={phase.notice}
          onSignedIn={onSignedIn}
          onChangeWorkspace={() => setPhase({ k: "workspace", back: true })}
          onConfig={setConfig}
        />
      );
    case "createPin":
      return <CreatePinScreen onDone={() => void afterPin()} />;
    case "offerBio":
      return (
        <BioOfferScreen
          kind={phase.kind}
          onEnable={async () => { await saveBioEnabled(true); setPhase({ k: "app" }); }}
          onSkip={() => setPhase({ k: "app" })}
        />
      );
    case "unreachable":
      return (
        <UnreachableScreen
          workspace={getWorkspace() ?? ""}
          onRetry={() => { setSession((n) => n + 1); setPhase({ k: "app" }); }}
          onSignOut={() => void endSession(t("mob.signin.signedOut"), true)}
        />
      );
    case "locked":
      return <LockScreen name={name} bio={bio} onUnlock={() => { setSession((n) => n + 1); setPhase({ k: "app" }); }} onSignOut={onLockSignOut} />;
    case "app":
      return (
        <>
          <div hidden={overlay} className="mob-app">
            <FrappeProvider
              key={session}
              url={getWorkspace() ?? ""}
              tokenParams={TOKEN_PARAMS}
              enableSocket={false}
              swrConfig={swrConfig}
            >
              <AuthWatch />
              <BrowserRouter basename="/">
                <App />
              </BrowserRouter>
            </FrappeProvider>
          </div>
          {overlay && (
            <div className="mob-overlay">
              <LockScreen name={name} bio={bio} onUnlock={() => setOverlay(false)} onSignOut={onLockSignOut} />
            </div>
          )}
        </>
      );
  }
}

/** Ends the session on 401 / AuthenticationError. Install before SWR fetches. */
function AuthWatch() {
  const ctx = useContext(FrappeContext);
  const axios = ctx?.app.axios;
  const installed = useRef<{ axios: NonNullable<typeof axios>; id: number } | null>(null);

  const install = () => {
    if (!axios || installed.current?.axios === axios) return;
    const id = axios.interceptors.response.use(undefined, (err: { response?: { status?: number; data?: { exc_type?: string } } }) => {
      const r = err?.response;
      if (r?.status === 401 || r?.data?.exc_type === "AuthenticationError") {
        window.dispatchEvent(new CustomEvent<MobileSignal>(MOBILE_SIGNAL, { detail: "auth-lost" }));
      }
      return Promise.reject(err);
    });
    installed.current = { axios, id };
  };

  install();

  useEffect(() => {
    install();
    return () => {
      const cur = installed.current;
      if (cur) {
        cur.axios.interceptors.response.eject(cur.id);
        installed.current = null;
      }
    };
  }, [axios]);

  return null;
}
