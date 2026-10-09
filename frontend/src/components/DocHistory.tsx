/**
 * DocHistory — field-level change log for one saved document.
 *
 * Callers: DetailActions (when doctype+name are set), detail/form screens
 * that pass the button into PageHead actions.
 *
 * Loads taxmate.api.resource.get_versions only after the panel opens.
 */
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { t } from "../i18n/strings";
import { METHOD, readableError } from "../lib/frappe";
import { datetime } from "../lib/format";

import "../styles/history.css";

type FieldChange = { field: string; label: string; old: string; new: string };
type RowAdd = { table: string; label: string; summary: string };
type RowChange = {
  table: string;
  label: string;
  row: number;
  row_name: string;
  fields: FieldChange[];
};

type VersionRow = {
  name: string;
  owner?: string;
  owner_name?: string;
  creation?: string;
  changed?: FieldChange[];
  added?: RowAdd[];
  removed?: RowAdd[];
  row_changed?: RowChange[];
};

type HistoryPayload = {
  track_changes: boolean;
  created_by?: string | null;
  created_by_name?: string | null;
  created_on?: string | null;
  versions: VersionRow[];
};

export type DocHistoryProps = {
  doctype: string;
  name: string;
  /** Extra class on the trigger button. */
  className?: string;
};

function initials(label: string): string {
  const parts = label.split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function hasBody(row: VersionRow): boolean {
  return Boolean(
    (row.changed && row.changed.length)
    || (row.added && row.added.length)
    || (row.removed && row.removed.length)
    || (row.row_changed && row.row_changed.length),
  );
}

function ChangeLine({ c }: { c: FieldChange }) {
  const oldVal = c.old || "—";
  const newVal = c.new || "—";
  return (
    <li className="hist-change">
      <span className="k">{c.label}</span>
      <div className="hist-vals">
        <span className="hist-chip old">{oldVal}</span>
        <span className="hist-arrow" aria-hidden="true">→</span>
        <span className="hist-chip new">{newVal}</span>
      </div>
    </li>
  );
}

function VersionBlock({ row }: { row: VersionRow }) {
  const who = row.owner_name || row.owner || "—";
  return (
    <li className="hist-item">
      <span className="hist-node" aria-hidden="true">{initials(who)}</span>
      <div className="hist-card">
        <div className="hist-meta">
          <span className="hist-who">{who}</span>
          <time className="hist-when" dateTime={row.creation || undefined}>
            {datetime(row.creation)}
          </time>
        </div>
        {!hasBody(row) ? (
          <p className="hist-note">{t("hist.empty")}</p>
        ) : (
          <ul className="hist-changes">
            {(row.changed ?? []).map((c) => (
              <ChangeLine key={`${row.name}-${c.field}-${c.old}-${c.new}`} c={c} />
            ))}
            {(row.added ?? []).map((a, i) => (
              <li className="hist-change" key={`${row.name}-add-${i}`}>
                <span className="k">{t("hist.added").replace("{table}", a.label)}</span>
                {a.summary ? <div className="hist-vals"><span className="hist-chip new">{a.summary}</span></div> : null}
              </li>
            ))}
            {(row.removed ?? []).map((a, i) => (
              <li className="hist-change" key={`${row.name}-rm-${i}`}>
                <span className="k">{t("hist.removed").replace("{table}", a.label)}</span>
                {a.summary ? <div className="hist-vals"><span className="hist-chip old">{a.summary}</span></div> : null}
              </li>
            ))}
            {(row.row_changed ?? []).map((r) => (
              <li className="hist-change" key={`${row.name}-row-${r.row_name}`}>
                <span className="k">
                  {t("hist.rowChanged").replace("{n}", String(r.row + 1)).replace("{table}", r.label)}
                </span>
                <ul className="hist-changes" style={{ marginBlockStart: 4 }}>
                  {r.fields.map((c) => (
                    <ChangeLine key={`${r.row_name}-${c.field}`} c={c} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export default function DocHistory({ doctype, name, className }: DocHistoryProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const ready = open && !!doctype && !!name;
  const { data, error, isLoading, mutate } = useFrappeGetCall<{ message: HistoryPayload }>(
    METHOD.getVersions,
    ready ? { doctype, name, limit: 50 } : undefined,
    ready ? `doc-history-${doctype}-${name}` : null,
    { isPaused: () => !ready, revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
      );
      const items = [...focusable].filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (open) void mutate();
  }, [open, mutate]);

  const payload = data?.message;
  const errMsg = error ? readableError(error).join(" ") : null;
  const changeCount = payload?.versions.length ?? 0;

  const panel = open && typeof document !== "undefined"
    ? createPortal(
      <>
        <button
          type="button"
          className="hist-scrim"
          aria-label={t("hist.close")}
          onClick={() => setOpen(false)}
        />
        <div
          ref={panelRef}
          className="hist-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="hist-grip" aria-hidden="true" />
          <div className="hist-head">
            <div className="hist-head-text">
              <p className="hist-eyebrow">
                {t("hist.title")}
                {changeCount > 0 ? (
                  <b>{t("hist.changes").replace("{n}", String(changeCount))}</b>
                ) : null}
              </p>
              <h2 id={titleId}>{name}</h2>
              <p>{t("hist.sub")}</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="hist-close"
              aria-label={t("hist.close")}
              onClick={() => setOpen(false)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M3 3l8 8M11 3L3 11" />
              </svg>
            </button>
          </div>
          <div className="hist-body">
            {isLoading && !payload ? (
              <div className="hist-state" role="status">{t("hist.loading")}</div>
            ) : errMsg ? (
              <div className="hist-state err" role="alert">{errMsg || t("hist.loadError")}</div>
            ) : payload && !payload.track_changes ? (
              <div className="hist-state">{t("hist.off")}</div>
            ) : payload && payload.versions.length === 0 && !payload.created_on ? (
              <div className="hist-state">{t("hist.empty")}</div>
            ) : (
              <ul className="hist-list">
                {(payload?.versions ?? []).map((row) => (
                  <VersionBlock key={row.name} row={row} />
                ))}
                {payload?.created_on && (
                  <li className="hist-item">
                    <span className="hist-node origin" aria-hidden="true">
                      {initials(payload.created_by_name || payload.created_by || "?")}
                    </span>
                    <div className="hist-card">
                      <div className="hist-meta">
                        <span className="hist-who">{t("hist.created")}</span>
                        <time className="hist-when" dateTime={payload.created_on}>
                          {datetime(payload.created_on)}
                        </time>
                      </div>
                      <p className="hist-event">
                        {t("hist.by").replace(
                          "{name}",
                          payload.created_by_name || payload.created_by || "—",
                        )}
                      </p>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </>,
      document.body,
    )
    : null;

  if (!doctype || !name) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ?? "btn ghost"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="hist-trigger-ic" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.5V8l2.25 1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {t("hist.title")}
      </button>
      {panel}
    </>
  );
}
