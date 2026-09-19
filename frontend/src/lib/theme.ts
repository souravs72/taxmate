/** Light / dark / system. Stamps data-theme so the token blocks resolve. */

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
}

export function toggleTheme(): void {
  const t = getTheme();
  if (t === "system") {
    setTheme(matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  } else {
    setTheme(t === "dark" ? "light" : "dark");
  }
}
