/// <reference types="vite/client" />
/** Pre-auth taxmate.api.mobile.* — JSON fetch, no cookies. */
import { readableError } from "../lib/frappe";
import { isMobileTest } from "./platform";
import { deviceId } from "./storage";

const M = "taxmate.api.mobile";
const TIMEOUT_MS = 15_000;
const GUEST_METHODS = new Set([`${M}.app_config`, `${M}.request_code`, `${M}.verify_code`, `${M}.login`]);

export type SignInResult = { token: string; user: string; full_name?: string; expires_on?: string };
export type NeedsCode = { needs_code: true; challenge: string };
export type AppConfig = { site_ok?: boolean; email_code_login?: boolean; min_app_version?: string; latest_app_version?: string };

export class MobileApiError extends Error {
  constructor(message: string, readonly status: number, readonly excType?: string) {
    super(message);
  }

  get unreachable(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

/** Host → `https://host[:port]`. Rejects IPs; localhost only in dev / mobile-test. */
export function normaliseWorkspace(input: string, allowLocal = allowLocalWorkspace()): string | null {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  s = s.split(/[/?#]/)[0] ?? "";
  if (!s || s.includes("@") || s.includes("\\")) return null;
  let u: URL;
  try {
    u = new URL(`https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host.startsWith("[") || host.includes(":")) return null;
  if (/^[0-9.]+$/.test(host)) return null;
  const port = u.port ? `:${u.port}` : "";
  if (host === "localhost" || host.endsWith(".localhost")) return allowLocal ? `https://${host}${port}` : null;
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes(".") || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  return `https://${host}${port}`;
}

export function allowLocalWorkspace(): boolean {
  return import.meta.env.DEV || isMobileTest();
}

async function call<T>(
  base: string,
  method: string,
  opts: { post?: boolean; args?: Record<string, unknown>; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.token && !GUEST_METHODS.has(method)) headers.Authorization = `TaxMate ${opts.token}`;
  let url = `${base}/api/method/${method}`;
  let body: string | undefined;
  if (opts.post) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.args ?? {});
  } else if (opts.args) {
    url += `?${new URLSearchParams(opts.args as Record<string, string>).toString()}`;
  }

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.post ? "POST" : "GET",
      headers,
      body,
      credentials: "omit",
      signal: ctrl.signal,
    });
  } catch {
    throw new MobileApiError("network", 0);
  } finally {
    window.clearTimeout(timer);
  }

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON (proxy page, HTML error) */
  }
  if (!res.ok || data.exc || data.exc_type) {
    const excType = typeof data.exc_type === "string" ? data.exc_type : undefined;
    const msg = data._server_messages || data.message || data.exception ? readableError(data).join(" ") : "";
    throw new MobileApiError(msg, res.status, excType);
  }
  return data.message as T;
}

export async function appConfig(base: string): Promise<AppConfig> {
  const cfg = await call<AppConfig>(base, `${M}.app_config`);
  if (!cfg || cfg.site_ok !== true) throw new MobileApiError("not-taxmate", 200);
  return cfg;
}

async function deviceArgs() {
  const { platform, appVersion } = await deviceInfo();
  return {
    device_id: await deviceId(),
    device_name: deviceName(platform),
    platform,
    app_version: appVersion,
  };
}

async function deviceInfo(): Promise<{ platform: "android" | "ios" | "web"; appVersion: string }> {
  let platform: "android" | "ios" | "web" = "web";
  let appVersion = "0.0.0";
  try {
    const { Capacitor } = await import("@capacitor/core");
    const p = Capacitor.getPlatform();
    platform = p === "android" || p === "ios" ? p : "web";
    if (platform !== "web") {
      const { App } = await import("@capacitor/app");
      appVersion = (await App.getInfo()).version;
    }
  } catch {
    /* web fallback */
  }
  return { platform, appVersion };
}

function deviceName(platform: string): string {
  const ua = navigator.userAgent;
  if (platform === "ios") return /iPad/.test(ua) ? "iPad" : "iPhone";
  if (platform === "android") return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  return "Browser";
}

export async function requestCode(base: string, email: string): Promise<string> {
  const r = await call<{ ok?: boolean; challenge?: string }>(base, `${M}.request_code`, { post: true, args: { email } });
  if (!r?.challenge) throw new MobileApiError("", 500);
  return r.challenge;
}

export async function verifyCode(base: string, challenge: string, code: string): Promise<SignInResult> {
  return call<SignInResult>(base, `${M}.verify_code`, {
    post: true,
    args: { challenge, code, ...(await deviceArgs()) },
  });
}

export async function passwordLogin(base: string, usr: string, pwd: string): Promise<SignInResult | NeedsCode> {
  return call<SignInResult | NeedsCode>(base, `${M}.login`, {
    post: true,
    args: { usr, pwd, ...(await deviceArgs()) },
  });
}

export async function serverLogout(base: string, token: string): Promise<void> {
  await call(base, `${M}.logout`, { post: true, token });
}

export function revokeQuietly(base: string | null | undefined, token: string | null | undefined): void {
  if (base && token) void serverLogout(base, token).catch(() => {});
}
