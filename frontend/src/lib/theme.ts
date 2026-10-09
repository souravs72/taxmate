/** Light / dark / system. Stamps data-theme so the token blocks resolve. */

import { isNative, MOBILE_BUILD } from "../mobile/platform";

const KEY = "taxmate-theme";
export type Theme = "light" | "dark" | "system";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return "system";
}

export function setTheme(t: Theme): void {
  try {
    t === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme();
}

export function applyTheme(): void {
  const t = getTheme();
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
  root.style.colorScheme = appearance();
  void syncNativeStatusBar();
}

export function appearance(): "light" | "dark" {
  const chosen = getTheme();
  if (chosen === "light" || chosen === "dark") return chosen;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function toggleTheme(): void {
  setTheme(appearance() === "dark" ? "light" : "dark");
}

/** Capacitor: keep status-bar icons readable; web content paints under it. */
async function syncNativeStatusBar(): Promise<void> {
  if (!MOBILE_BUILD || !isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: appearance() === "dark" ? Style.Light : Style.Dark });
  } catch {
    /* plugin missing in browser mobile-test */
  }
}
