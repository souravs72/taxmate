/** Shared primitives. Every one maps to a class in styles/app.css. */

import { createContext, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { money, pct } from "../lib/format";
import { readableError } from "../lib/frappe";
import {
  getFormActionNode,
  getFormActionVersion,
  subscribeFormActions,
} from "../lib/pageActions";
import { t } from "../i18n/strings";
import { useIsPhone } from "../lib/useMedia";

import "../styles/form-mobile.css";

/* ── Layout ───────────────────────────────────────────────────────────── */

/**
 * The page's actions as a fixed bar sitting directly above the phone tab bar.
 *
 * Deliberately a *wrapping* bar rather than a "first two + ⋮ overflow" bar:
 * every caller passes `actions` as a single fragment (DetailActions and
 * FormActions both return one), whose children are conditionally `false`, so
 * the rendered action count cannot be established from outside without
 * guessing. Wrapping needs no count, keeps every action reachable, and cannot
 * silently hide one.
 *
 * The bar's own height is published as `--pact-h` on the document element so
 * `.page.mnav-pad` can reserve exactly the right clearance whether the actions
 * land on one row or two. See styles/form-mobile.css.
 */
/**
 * True for anything rendered *inside* a `.pact-bar`.
 *
 * `FormActions` (components/form.tsx) is handed to `PageHead actions` by nine
 * form screens and rendered inline at the foot of the main column by the
 * other twenty-eight. It needs its own bar in the second case and must not
 * build a second one in the first, and context answers that synchronously —
 * no DOM probe, no post-paint jump.
 */
export const InPageActionBar = createContext(false);

/** True while rendering inside PageHead, including the phone action bar. */
export const InPageHead = createContext(false);

export function PageActionBar({ actions }: { actions: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof document === "undefined") return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--pact-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    sync();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === "function") {
      ro = new ResizeObserver(sync);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--pact-h");
    };
  }, []);

  return (
    <div className="pact-bar" role="group" aria-label={t("m.actions")} ref={ref}>
      <InPageActionBar.Provider value={true}>{actions}</InPageActionBar.Provider>
    </div>
  );
}

export function PageHead({
  title, sub, eyebrow, actions, children, viewControls, stickyActions = true,
}: {
  title: React.ReactNode; sub?: string; eyebrow?: React.ReactNode;
  actions?: React.ReactNode; children?: React.ReactNode;
  /**
   * Controls that change what you are *looking at* rather than what you are
   * doing — the dashboards' Owner/Accountant switch, say. On a desktop they
   * sit in the right-hand action cluster immediately before the primary
   * button (New sale / Export); on a phone they stay under the title instead
   * of taking a whole row of the fixed action bar.
   */
  viewControls?: React.ReactNode;
  /**
   * Phones only. `actions` normally becomes the fixed bar above the tab bar,
   * which is right for things you *do* (Save, Submit, New sale). Pass false
   * where `actions` is a control you *type into* — the Reports filter, say:
   * pinning a text field over the list it filters hides the answer while you
   * type, and the on-screen keyboard then covers the bar anyway.
   */
  stickyActions?: boolean;
}) {
  const phone = useIsPhone();
  const hostedVersion = useSyncExternalStore(
    subscribeFormActions,
    getFormActionVersion,
    getFormActionVersion,
  );
  const hosted = actions ? null : (hostedVersion ? getFormActionNode() : null);
  const bar = actions ?? hosted;
  const pinActions = phone && stickyActions && bar;
  // Desktop (and non-pinned phone): pack switcher + buttons on the right.
  // CSS orders the switcher just before the last .btn (Sale / Export).
  const showInlineActs = !pinActions && Boolean(bar || (!phone && viewControls));
  return (
    <InPageHead.Provider value={true}>
      <div className="phead">
        <div className="phead-main">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
          {children}
          {phone && viewControls && <div className="phead-views">{viewControls}</div>}
        </div>
        {pinActions && <PageActionBar actions={bar} />}
        {showInlineActs ? (
          <div className="acts">
            {!phone && viewControls ? <div className="phead-views">{viewControls}</div> : null}
            {bar}
          </div>
        ) : null}
      </div>
    </InPageHead.Provider>
  );
}

export function Card({
  title, hint, num, children, bodyClass,
}: {
  title?: React.ReactNode; hint?: React.ReactNode; num?: number;
  children: React.ReactNode; bodyClass?: string | null;
}) {
  return (
    <section className="card">
      {title && (
        <div className="chead">
          <h2>{num != null && <span className="snum">{num}</span>}{title}</h2>
          {hint && <span className="hint">{hint}</span>}
        </div>
      )}
      {bodyClass === null ? children : <div className={bodyClass ?? "cbody"}>{children}</div>}
    </section>
  );
}

/* ── State ────────────────────────────────────────────────────────────── */

export function Loading({ label }: { label?: string }) {
  return (
    <div className="tm-load" role="status" aria-live="polite" aria-busy="true">
      <div className="tm-load-orb" aria-hidden="true">
        <svg className="tm-load-svg" viewBox="0 0 72 72" fill="none" aria-hidden="true">
          <circle className="tm-load-track" cx="36" cy="36" r="30" />
          <g className="tm-load-spin">
            <circle className="tm-load-arc" cx="36" cy="36" r="30" />
          </g>
          <g className="tm-load-spin-rev">
            <circle className="tm-load-halo" cx="36" cy="36" r="22" />
          </g>
        </svg>
        <span className="tm-load-core">
          <span className="tm-load-glyph">T</span>
        </span>
      </div>
      <div className="tm-load-ledger" aria-hidden="true">
        <span /><span /><span />
      </div>
      <p className="tm-load-label">{label ?? t("list.loading")}</p>
    </div>
  );
}

export function Empty({ label }: { label: string }) {
  return <div className="empty">{label}</div>;
}

/**
 * Frappe errors arrive as HTML, often several messages joined by <br>.
 * Split them into a list — a wall of markup is the single most common way
 * a Frappe frontend makes a clear server message unreadable.
 */
export function ErrorBox({
  error, onRetry, heading = true,
}: {
  error: unknown;
  onRetry?: () => void;
  /** False when the server message is the whole alert, as on a failed delete. */
  heading?: boolean;
}) {
  const lines = readableError(error);
  return (
    <div className="alert" role="alert" style={{ background: "var(--bad-bg)", flexDirection: "column", gap: 8 }}>
      {heading && <b>{t("error.title")}</b>}
      {lines.length === 1 ? (
        <span>{lines[0]}</span>
      ) : (
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}
      {onRetry && <button className="btn ghost sm" onClick={onRetry}>{t("error.retry")}</button>}
    </div>
  );
}

/** Server throw, shown as a dialog seated at the top of the page. */
export function MessageDialog({ error, onClose }: { error: unknown; onClose: () => void }) {
  const lines = readableError(error);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return createPortal(
    <div className="msgdlg-back" onMouseDown={onClose}>
      <div
        className="msgdlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="msgdlg-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="msgdlg-head">
          <span className="msgdlg-dot" aria-hidden="true" />
          <h2 id="msgdlg-title">{t("error.dialog")}</h2>
          <button
            ref={closeRef}
            type="button"
            className="msgdlg-x"
            aria-label={t("m.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="msgdlg-body">
          {lines.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────── */

export function Pill({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`pill ${cls}`}>{children}</span>;
}

export function StatTile({
  colour, tint, icon, label, value, unit, foot, spark,
}: {
  colour: string; tint: string; icon: string; label: string;
  value: React.ReactNode; unit?: string; foot?: string; spark?: string;
}) {
  return (
    <div className="tile" style={{ ["--tint" as string]: tint }}>
      <div className="row">
        <span className="bdg" style={{ background: colour }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
               dangerouslySetInnerHTML={{ __html: icon }} />
        </span>
        <div className="copy">
          <span className="k">{label}</span>
          <div className="v">{unit && <small>{unit}</small>} {value}</div>
        </div>
        {spark && (
          <svg className="spark" width="66" height="26" viewBox="0 0 66 26" fill="none" aria-hidden="true">
            <polyline points={spark} stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </div>
      {foot && <div className="tnote">{foot}</div>}
    </div>
  );
}

export function MiniBar({ value, colour }: { value: number; colour: string }) {
  return (
    <div className="ftrack">
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: colour }} />
    </div>
  );
}

export function BarRow({ label, value, amount, colour, currency }: {
  label: string; value: number; amount: number; colour: string; currency?: string;
}) {
  return (
    <div className="bar">
      <div className="lab">
        <span className="l"><i className="sw" style={{ background: colour }} />{label}</span>
        <span className="r">{pct(value)}<small>{currency ? `${currency} ` : ""}{money(amount)}</small></span>
      </div>
      <div className="track"><i style={{ width: `${value}%`, background: colour }} /></div>
    </div>
  );
}

/**
 * Donut for mutually exclusive buckets.
 * A 2px gap between segments and a legend carrying count + value, so the
 * data is readable without reading the chart.
 */
export function Donut({
  data, total, centreLabel, size = 140,
}: {
  data: { key: string; label: string; n: number; colour: string }[];
  total: number; centreLabel: string; size?: number;
}) {
  const r = 56, sw = 19, c = 2 * Math.PI * r, gap = 3, mid = size / 2;
  let off = 0;
  return (
    <div className="donutbox">
      <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centreLabel}>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--track)" strokeWidth={sw} />
        {data.map((s) => {
          const len = total ? c * (s.n / total) : 0;
          const el = (
            <circle key={s.key} cx={mid} cy={mid} r={r} fill="none" stroke={s.colour} strokeWidth={sw}
              strokeDasharray={`${Math.max(0, len - gap)} ${c - Math.max(0, len - gap)}`}
              strokeDashoffset={-off} transform={`rotate(-90 ${mid} ${mid})`}>
              <title>{`${s.label}: ${s.n}`}</title>
            </circle>
          );
          off += len;
          return el;
        })}
      </svg>
      <div className="mid">
        <span className="big">{total}</span>
        <span className="cap">{centreLabel}</span>
      </div>
    </div>
  );
}

export function Legend({ data }: {
  data: { key: string; label: string; n: number; value?: number; colour: string }[];
}) {
  return (
    <div className="legend">
      {data.map((s) => (
        <div className="lgi" key={s.key}>
          <i className="sw" style={{ background: s.colour }} />
          <span className="nm">{s.label}</span>
          <span className="ct">{s.n}</span>
          <span className="vl">{s.value != null ? money(s.value) : ""}</span>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, required, hint, htmlFor, children }: {
  label: string; required?: boolean; hint?: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="f">
      <label htmlFor={htmlFor}>{label} {required && <span className="req">*</span>}</label>
      {children}
      {hint && <span className="help">{hint}</span>}
    </div>
  );
}

/** Checkbox for a doctype flag such as Disabled or Enabled. */
export function CheckField({ label, hint, checked, onChange, disabled }: {
  label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        className="check"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </Field>
  );
}

export function ReadRow({ k, v, sub, link }: {
  k: string; v: React.ReactNode; sub?: string; link?: boolean;
}) {
  return (
    <div className="fi">
      <span className="k">{k}</span>
      <span className={`v${link ? " link" : ""}`}>{v}{sub && <small>{sub}</small>}</span>
    </div>
  );
}

export function SumRow({ k, v, cls, currency }: { k: string; v: React.ReactNode; cls?: string; currency?: string }) {
  return (
    <div className={`srow${cls ? ` ${cls}` : ""}`}>
      <span className="k">{k}</span>
      <span className="v">{currency ? <span className="cur">{currency}</span> : null}{v}</span>
    </div>
  );
}
