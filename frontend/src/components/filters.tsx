/**
 * Filter controls for the list screens.
 *
 * The reason these are shared rather than copied: LinkField reports a pick but
 * never a clear, so every screen that used it as a filter had to grow its own
 * reset button. One of them forgot, and the user was stuck with a customer
 * filter they could not remove. `LinkFilter` carries the reset.
 *
 * Below 760px `FilterBar` stops being a wrapping row — five controls ate half
 * a phone screen before the first row of data. The search stays out (it is the
 * one people use); everything else moves into a bottom sheet behind a
 * "Filters" button that carries a count. The controls themselves are handed
 * over untouched: same props, same handlers, different place.
 */

import {
  Children, isValidElement, useEffect, useRef, useState,
  type ReactElement, type ReactNode,
} from "react";

import { t } from "../i18n/strings";
import { useIsPhone } from "../lib/useMedia";
import LinkField from "./LinkField";
import "../styles/list-mobile.css";

/* ── The bar ──────────────────────────────────────────────────────────── */

/** Props a filter exposes its current value through, and how to clear each. */
const CLEARABLE: { value: string; handler: string }[] = [
  { value: "value", handler: "onChange" },
  { value: "from", handler: "onFrom" },
  { value: "to", handler: "onTo" },
];

type AnyProps = Record<string, unknown>;

function propsOf(node: ReactNode): AnyProps | null {
  if (!isValidElement(node)) return null;
  return (node as ReactElement<AnyProps>).props ?? null;
}

/** A filter counts as set when any of its value props holds something. */
function isSet(node: ReactNode): boolean {
  const props = propsOf(node);
  if (!props) return false;
  return CLEARABLE.some(({ value }) => typeof props[value] === "string" && props[value] !== "");
}

/**
 * Clear ONE value on one child, through the handler it was already given.
 *
 * One at a time on purpose: the screens keep filters in the URL, and each
 * setter builds the next query string from the params of the render it was
 * created in. Two calls in the same tick and the second would resurrect what
 * the first removed — so "Clear all" walks the list one render at a time.
 */
function clearOne(node: ReactNode): boolean {
  const props = propsOf(node);
  if (!props) return false;
  for (const { value, handler } of CLEARABLE) {
    const fn = props[handler];
    if (typeof props[value] === "string" && props[value] !== "" && typeof fn === "function") {
      (fn as (v: string) => void)("");
      return true;
    }
  }
  return false;
}

export function FilterBar({ children }: { children: ReactNode }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  /* -1 idle; otherwise the number of values cleared so far this run. */
  const [clearStep, setClearStep] = useState(-1);
  const sheet = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  const kids = Children.toArray(children);
  const search = kids.filter((k) => isValidElement(k) && k.type === SearchFilter);
  const rest = kids.filter((k) => !(isValidElement(k) && k.type === SearchFilter));
  const applied = rest.filter(isSet).length;

  /* One clear per render, until nothing is set (or the guard trips). */
  useEffect(() => {
    if (clearStep < 0) return;
    if (clearStep > 24) { setClearStep(-1); return; }
    const next = kids.find(isSet);
    if (!next || !clearOne(next)) { setClearStep(-1); return; }
    setClearStep(clearStep + 1);
  });

  useEffect(() => {
    if (!open) return;
    sheet.current?.focus();
    const focusable =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !sheet.current) return;
      const items = Array.from(sheet.current.querySelectorAll<HTMLElement>(focusable)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = !!current && sheet.current.contains(current);
      if (e.shiftKey) {
        if (!inside || current === first) {
          e.preventDefault();
          last.focus();
        }
        return;
      }
      if (!inside || current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  /* A phone rotating into landscape closes the sheet rather than stranding it. */
  useEffect(() => { if (!phone) setOpen(false); }, [phone]);

  if (!phone) return <div className="filters">{children}</div>;

  /* A list whose only filter is the search (Customers, Items…) gets the bar
     and no button — a Filters button that opens an empty sheet is a lie. */
  if (rest.length === 0) return <div className="lm-fbar">{search}</div>;

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <div className="lm-fbar">
        {search}
        <button ref={trigger} type="button"
          className={`lm-fbtn${applied > 0 ? " lm-on" : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}>
          <svg className="lm-ic" width="15" height="15" viewBox="0 0 16 16" fill="none"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M2 4h12M4.5 8h7M7 12h2" />
          </svg>
          {t("m.filters")}
          {applied > 0 && <span className="lm-fcount">{applied}</span>}
        </button>
      </div>

      {open && (
        <>
          <button type="button" className="lm-scrim" tabIndex={-1}
            aria-label={t("m.close")} onClick={close} />
          <div className="lm-sheet" ref={sheet} role="dialog" aria-modal="true"
            aria-label={t("m.filters")} tabIndex={-1}>
            <div className="lm-shead">
              <b>{t("m.filters")}</b>
              {applied > 0 && (
                <span className="lm-sapplied">{t("m.filters.on").replace("{n}", String(applied))}</span>
              )}
              <button type="button" className="lm-x" aria-label={t("m.close")} onClick={close}>✕</button>
            </div>
            <div className="lm-sbody">
              {rest.map((child, i) => <div className="lm-frow" key={i}>{child}</div>)}
            </div>
            <div className="lm-sfoot">
              <button type="button" className="btn ghost"
                onClick={() => setClearStep(0)}>{t("m.filters.clear")}</button>
              <button type="button" className="btn" onClick={close}>{t("m.filters.show")}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ── The controls (unchanged; the sheet only relocates them) ──────────── */

export function SearchFilter({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="fsearch">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
      </svg>
      <input className="ctl" type="search" value={value} placeholder={placeholder}
        aria-label={placeholder}
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
export function LinkFilter({ doctype, value, onChange, placeholder, clearLabel, filters }: {
  doctype: string; value: string; onChange: (v: string) => void;
  placeholder: string; clearLabel?: string; filters?: unknown;
}) {
  return (
    <div style={{ minWidth: 0, display: "flex", gap: 6, alignItems: "center" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <LinkField doctype={doctype} value={value} placeholder={placeholder} filters={filters} onChange={onChange} />
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
