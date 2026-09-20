/**
 * Filter controls for the list screens.
 *
 * The reason these are shared rather than copied: LinkField reports a pick but
 * never a clear, so every screen that used it as a filter had to grow its own
 * reset button. One of them forgot, and the user was stuck with a customer
 * filter they could not remove. `LinkFilter` carries the reset.
 */

import { t } from "../i18n/strings";
import LinkField from "./LinkField";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="filters">{children}</div>;
}

export function SearchFilter({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="fsearch">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
      </svg>
      <input className="ctl" type="search" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SelectFilter<T extends string>({ value, onChange, allLabel, options, label }: {
  value: T | "";
  onChange: (v: T | "") => void;
  allLabel: string;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <select className="ctl" value={value} aria-label={label ?? allLabel}
      onChange={(e) => onChange(e.target.value as T | "")}>
      <option value="">{allLabel}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** A link-search filter that can actually be cleared again. */
export function LinkFilter({ doctype, value, onChange, placeholder, clearLabel }: {
  doctype: string; value: string; onChange: (v: string) => void;
  placeholder: string; clearLabel?: string;
}) {
  return (
    <div style={{ minWidth: 190, display: "flex", gap: 6, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <LinkField doctype={doctype} value={value} placeholder={placeholder} onChange={onChange} />
      </div>
      {value && (
        <button className="rm" aria-label={clearLabel ?? t("filter.clear")} onClick={() => onChange("")}>
          ✕
        </button>
      )}
    </div>
  );
}

export function DateRangeFilter({ from, to, onFrom, onTo }: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void;
}) {
  return (
    <span className="daterange">
      {t("filter.from")}
      <input className="ctl" type="date" value={from} aria-label={t("filter.from")}
        onChange={(e) => onFrom(e.target.value)} />
      {t("filter.to")}
      <input className="ctl" type="date" value={to} aria-label={t("filter.to")}
        onChange={(e) => onTo(e.target.value)} />
    </span>
  );
}
