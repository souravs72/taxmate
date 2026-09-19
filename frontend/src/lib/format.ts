/** Money, dates and numbers. AED, 2dp, tabular figures everywhere. */

import { getLocale } from "./i18n";

export function money(n: number | string | undefined | null): string {
  const v = typeof n === "string" ? parseFloat(n.replace(/,/g, "")) : (n ?? 0);
  return (Number.isFinite(v) ? v : 0).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function qty(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString("en-AE", { maximumFractionDigits: 3 });
}

export function pct(n: number | undefined | null): string {
  return `${Math.round(n ?? 0)}%`;
}

/** Frappe dates are ISO `YYYY-MM-DD`. Never pass a Date straight back. */
export function date(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(getLocale(), { day: "2-digit", month: "short", year: "numeric" });
}

export function datetime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(getLocale(), {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function parseNum(s: string | number): number {
  if (typeof s === "number") return s;
  const v = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(v) ? v : 0;
}
