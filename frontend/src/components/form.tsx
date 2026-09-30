/**
 * Form-screen scaffolding.
 *
 * Six screens were repeating the same two-column body, and two were
 * repeating the readiness checklist verbatim — including its "five things"
 * copy, which stopped being true the moment a conditional sixth check
 * appeared. Here the count comes from the list.
 */

import { useContext, useLayoutEffect, useRef } from "react";

import { t } from "../i18n/strings";
import { useLang } from "../lib/i18n";
import { clearFormActions, publishFormActions } from "../lib/pageActions";
import { Card, InPageHead } from "./ui";

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

export type Check = { ok: boolean; label: string; href?: string };

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
 * Focusable list of failed readiness checks after a blocked save/submit.
 * Complements ReadinessCard; keeps field requirements visible in the aside.
 */
export function MissingSummary({
  checks,
  active,
  summaryRef,
}: {
  checks: Check[];
  active: boolean;
  summaryRef: React.Ref<HTMLDivElement>;
}) {
  const missing = checks.filter((c) => !c.ok);
  if (!active || missing.length === 0) return null;
  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      className="alert"
      style={{ background: "var(--bad-bg)", flexDirection: "column", gap: 8, outline: "none" }}
      aria-labelledby="txn-missing-title"
    >
      <strong id="txn-missing-title">{t("txn.formProblem")}</strong>
      <ul style={{ margin: 0, paddingInlineStart: 18 }}>
        {missing.map((c) => (
          <li key={c.label}>
            {c.href ? <a href={c.href}>{c.label}</a> : c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

type ActionApi = {
  onDiscard: () => void;
  onSave?: () => void;
  onSubmit?: () => void;
  busy?: boolean;
  ready?: boolean;
  submitLabel?: string;
  saveLabel?: string;
  extra?: React.ReactNode;
};

/**
 * Reads handlers from a ref so a click always runs the latest save, even
 * when the header has not re-rendered since the last keystroke.
 */
function ActionButtons({ api }: { api: React.RefObject<ActionApi | null> }) {
  const a = api.current;
  if (!a) return null;
  const blocked = !!a.busy || a.ready === false;
  return (
    <>
      <button type="button" className="btn ghost" onClick={() => api.current?.onDiscard()}>{t("soc.discard")}</button>
      {a.extra}
      {a.onSave && (
        <button type="button" className="btn ghost" disabled={blocked} onClick={() => api.current?.onSave?.()}>
          {a.busy ? t("soc.saving") : (a.saveLabel ?? t("soc.save"))}
        </button>
      )}
      {a.onSubmit && (
        <button type="button" className="btn" disabled={blocked} onClick={() => api.current?.onSubmit?.()}>
          {a.submitLabel ?? t("inv.submit")}
        </button>
      )}
    </>
  );
}

/**
 * Discard / Save draft / Submit.
 *
 * `busy` disables everything and renames the save, so a double-click cannot
 * post twice — which on a payment means posting twice to the ledger.
 *
 * Screens that pass this as PageHead `actions` render the buttons here.
 * Screens that leave it in the form body publish the same cluster so PageHead
 * can put it in that header slot, including the phone bar.
 */
export function FormActions({
  onDiscard, onSave, onSubmit, busy, ready, submitLabel, saveLabel, extra,
}: ActionApi) {
  const inHead = useContext(InPageHead);
  const { lang } = useLang();
  const api = useRef<ActionApi | null>(null);
  api.current = { onDiscard, onSave, onSubmit, busy, ready, submitLabel, saveLabel, extra };
  const hasSave = !!onSave;
  const hasSubmit = !!onSubmit;
  useLayoutEffect(() => {
    if (inHead) return;
    const id = publishFormActions(<ActionButtons api={api} />);
    return () => clearFormActions(id);
  }, [inHead, busy, ready, submitLabel, saveLabel, hasSave, hasSubmit, lang]);
  if (!inHead) return null;
  return <ActionButtons api={api} />;
}
