/**
 * Form-screen scaffolding.
 *
 * Six screens were repeating the same two-column body, and two were
 * repeating the readiness checklist verbatim — including its "five things"
 * copy, which stopped being true the moment a conditional sixth check
 * appeared. Here the count comes from the list.
 */

import { t } from "../i18n/strings";
import { Card } from "./ui";

/** Main column plus a sticky aside. The `stack` spaces the main column. */
export function FormLayout({ children, aside }: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="body2">
      <div className="stack">{children}</div>
      {aside && <aside className="side">{aside}</aside>}
    </div>
  );
}

export type Check = { ok: boolean; label: string };

/**
 * What is still missing before this document can be submitted.
 *
 * Deliberately a list rather than a sentence: the caption counts the checks
 * it was given, so a form that adds a conditional requirement — a bank
 * reference, say — does not start lying about how many there are.
 */
export function ReadinessCard({ checks, title, caption }: {
  checks: Check[];
  title?: string;
  /** Use {n} where the number of checks belongs. */
  caption?: string;
}) {
  const done = checks.filter((c) => c.ok).length;
  return (
    <Card title={title ?? t("form.ready")} hint={`${done}/${checks.length}`}>
      {caption && (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>
          {caption.replace("{n}", String(checks.length))}
        </p>
      )}
      <div className="rlist">
        {checks.map((c) => (
          <div className={`ri ${c.ok ? "ok" : "no"}`} key={c.label}>
            <span className="mk">{c.ok ? "✓" : "○"}</span>
            <span>{c.label}</span>
          </div>
        ))}
      </div>
      <div className="meter"><i style={{ width: `${(done / Math.max(1, checks.length)) * 100}%` }} /></div>
    </Card>
  );
}

/**
 * Discard / Save draft / Submit.
 *
 * `busy` disables everything and renames the save, so a double-click cannot
 * post twice — which on a payment means posting twice to the ledger.
 */
export function FormActions({
  onDiscard, onSave, onSubmit, busy, ready, submitLabel, saveLabel, extra,
}: {
  onDiscard: () => void;
  onSave?: () => void;
  onSubmit?: () => void;
  busy?: boolean;
  ready?: boolean;
  submitLabel?: string;
  saveLabel?: string;
  extra?: React.ReactNode;
}) {
  const blocked = !!busy || ready === false;
  return (
    <>
      <button className="btn ghost" onClick={onDiscard}>{t("soc.discard")}</button>
      {extra}
      {onSave && (
        <button className="btn ghost" disabled={blocked} onClick={onSave}>
          {busy ? t("soc.saving") : (saveLabel ?? t("soc.save"))}
        </button>
      )}
      {onSubmit && (
        <button className="btn" disabled={blocked} onClick={onSubmit}>
          {submitLabel ?? t("inv.submit")}
        </button>
      )}
    </>
  );
}
