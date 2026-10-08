/** Native gate. Web may import this file — never import @capacitor/* here. */
declare const __TAXMATE_MOBILE__: boolean;

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export const MOBILE_BUILD: boolean = __TAXMATE_MOBILE__;

const TEST_KEY = "taxmate-mobile-test";
let cached: boolean | undefined;

function realNative(): boolean {
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

function testRequested(): boolean {
  try {
    const flag = new URLSearchParams(window.location.search).get("mobile-test");
    if (flag === "1") sessionStorage.setItem(TEST_KEY, "1");
    if (flag === "0") sessionStorage.removeItem(TEST_KEY);
    return sessionStorage.getItem(TEST_KEY) === "1";
  } catch {
    return false;
  }
}

export function isNative(): boolean {
  if (!__TAXMATE_MOBILE__) return false;
  if (cached === undefined) cached = realNative() || testRequested();
  return cached;
}

export function isMobileTest(): boolean {
  return __TAXMATE_MOBILE__ && isNative() && !realNative();
}

export type MobileSignal = "logout" | "auth-lost" | "unreachable" | "reload";
export const MOBILE_SIGNAL = "taxmate:mobile";

export function signalMobile(kind: MobileSignal): void {
  window.dispatchEvent(new CustomEvent<MobileSignal>(MOBILE_SIGNAL, { detail: kind }));
}

/** Web: assign. Native: strip /taxmate and remount (no PIN, basename `/`). */
export function hardNavigate(webPath: string): void {
  if (!MOBILE_BUILD || !isNative()) {
    window.location.assign(webPath);
    return;
  }
  const appPath = webPath.replace(/^\/taxmate(?=\/|\?|$)/, "") || "/";
  window.history.replaceState(null, "", appPath.startsWith("/") ? appPath : `/${appPath}`);
  signalMobile("reload");
}

export function hardReload(): void {
  if (!MOBILE_BUILD || !isNative()) {
    window.location.reload();
    return;
  }
  signalMobile("reload");
}

/** Dead token only — never wipe credentials on offline / 5xx. */
export function isAuthLost(error: unknown, currentUser: unknown): boolean {
  if (!error) return !currentUser || currentUser === "Guest";
  const e = error as { httpStatus?: number; exc_type?: string; exception?: string };
  return e.httpStatus === 401 || e.exc_type === "AuthenticationError" || /AuthenticationError/.test(e.exception ?? "");
}
