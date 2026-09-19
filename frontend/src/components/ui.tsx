/** Shared primitives. Every one maps to a class in styles/app.css. */

import { money, pct } from "../lib/format";
import { readableError } from "../lib/frappe";
import { t } from "../i18n/strings";

/* ── Layout ───────────────────────────────────────────────────────────── */

export function PageHead({
  title, sub, eyebrow, actions, children,
}: {
  title: React.ReactNode; sub?: string; eyebrow?: React.ReactNode;
  actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className="phead">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {children}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  );
}

export function Card({
  title, hint, num, children, bodyClass,
}: {
  title?: React.ReactNode; hint?: React.ReactNode; num?: number;
  children: React.ReactNode; bodyClass?: string;
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
  return <div style={{ padding: 28, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
    {label ?? t("list.loading")}
  </div>;
}

export function Empty({ label }: { label: string }) {
  return <div style={{ padding: 34, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>{label}</div>;
}

/**
 * Frappe errors arrive as HTML, often several messages joined by <br>.
 * Split them into a list — a wall of markup is the single most common way
 * a Frappe frontend makes a clear server message unreadable.
 */
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const lines = readableError(error);
  return (
    <div className="alert" style={{ background: "var(--bad-bg)", flexDirection: "column", gap: 8 }}>
      <b>{t("error.title")}</b>
      <ul style={{ margin: 0, paddingInlineStart: 18, color: "var(--muted)" }}>
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      {onRetry && <button className="btn ghost sm" onClick={onRetry}>{t("error.retry")}</button>}
    </div>
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
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
               dangerouslySetInnerHTML={{ __html: icon }} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span className="k">{label}</span>
          <div className="v">{unit && <small>{unit}</small>} {value}</div>
        </span>
        {spark && (
          <svg className="spark" width="66" height="26" viewBox="0 0 66 26" fill="none" aria-hidden="true">
            <polyline points={spark} stroke={colour} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </div>
      {foot && <div className="foot">{foot}</div>}
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

export function BarRow({ label, value, amount, colour }: {
  label: string; value: number; amount: number; colour: string;
}) {
  return (
    <div className="bar">
      <div className="lab">
        <span className="l"><i className="sw" style={{ background: colour }} />{label}</span>
        <span className="r">{pct(value)}<small>AED {money(amount)}</small></span>
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

export function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="f">
      <label>{label} {required && <span className="req">*</span>}</label>
      {children}
      {hint && <span className="help">{hint}</span>}
    </div>
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

export function SumRow({ k, v, cls }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className={`srow${cls ? ` ${cls}` : ""}`}>
      <span className="k">{k}</span>
      <span className="v"><span className="cur">AED</span>{v}</span>
    </div>
  );
}
