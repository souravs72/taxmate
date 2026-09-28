/**
 * Scan panel. Renders the dashboard IDP payload and decides nothing.
 * The backend names the jobs, the documents, and whether a draft can be saved.
 */

import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD, readableError } from "../../lib/frappe";
import { t } from "../../i18n/strings";

type Target = {
  doctype: string;
  label_key: string;
  route: string | null;
  ready: boolean;
};

type Action = {
  id: string;
  label_key: string;
  needs_file: boolean;
  needs_query: boolean;
  query_key: string | null;
  pick_key: string;
  run_key: string;
  runnable: boolean;
  pending_key: string;
  targets: Target[];
};

type Surface = {
  title_key: string;
  notices: string[];
  accept: string[];
  actions: Action[];
};

type Write = { field: string; label_key: string; value: string; options?: string[] };

type Review = {
  ok?: boolean;
  step?: string;
  error_key?: string | null;
  detail?: string | null;
  lines?: { label_key: string; value: string }[];
  items?: { label: string }[];
  gaps?: string[];
  writes?: Write[];
  can_save?: boolean;
  can_submit?: boolean;
  can_delete?: boolean;
  used_llm?: boolean;
  save_key?: string | null;
  route?: string | null;
  name?: string;
  matches?: { name: string; label: string; route: string | null }[];
  diffs?: { label_key: string; before: string; after: string; status: string }[];
};

export function CaptureDesk() {
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={openRef} type="button" className="btn" onClick={() => setOpen(true)}>
        ＋ {t("idp.open")}
      </button>
      {open ? (
        <CapturePanel
          onClose={() => {
            setOpen(false);
            openRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}

function CapturePanel({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const nav = useNavigate();
  const res = useFrappeGetCall<{ message: Surface }>(METHOD.idpSurface, undefined, "idp-surface");
  const surface = res.data?.message;
  const [actionId, setActionId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [writes, setWrites] = useState<Write[]>([]);

  const action = surface?.actions.find((row) => row.id === actionId) ?? null;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab" && panelRef.current) trapTab(event, panelRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function readFile() {
    if (lock.current || !action || !target) return;
    if (action.needs_file && !file) return;
    if (action.needs_query && !query.trim()) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    try {
      let url = "";
      if (action.needs_file && file) {
        const uploaded = await postFile(file);
        url = String(uploaded.file_url || "");
        setFileUrl(url);
      }
      const result = await postForm(METHOD.idpRun, {
        action: action.id,
        target_doctype: target,
        file_url: url,
        query: query.trim(),
      });
      setReview(result);
      setWrites(Array.isArray(result.writes) ? result.writes : []);
    } catch (err) {
      setReview({ ok: false, error_key: "idp.readFailed", detail: readableError(err).join(" ") });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function saveDraft(submit = false) {
    if (lock.current || !action || !target) return;
    if (action.needs_file && !fileUrl) return;
    lock.current = true;
    setBusy(true);
    try {
      const fills = Object.fromEntries(writes.map((row) => [row.field, row.value]));
      const result = await postForm(METHOD.idpSave, {
        action: action.id,
        target_doctype: target,
        file_url: fileUrl || "",
        query: query.trim(),
        fills: JSON.stringify(fills),
        submit: submit ? "1" : "",
      });
      setReview(result);
      if (result.ok && result.route && action.id !== "delete" && !result.error_key) nav(result.route);
    } catch (err) {
      setReview({ ok: false, error_key: "idp.readFailed", detail: readableError(err).join(" ") });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="idp-back" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="idp-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="idp-head">
          <h2 id={titleId}>{surface ? t(surface.title_key) : t("idp.title")}</h2>
          <button ref={closeRef} type="button" className="btn ghost sm" onClick={onClose}>
            {t("idp.close")}
          </button>
        </div>

        {res.error ? <p>{readableError(res.error).join(" ")}</p> : null}
        {!surface && res.isLoading ? <p>{t("idp.loading")}</p> : null}

        {surface ? (
          <>
            <ul className="idp-notes">
              {surface.notices.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            {surface.actions.length === 0 ? <p>{t("idp.empty")}</p> : null}
            <div className="idp-jobs" role="group" aria-label={t("idp.title")}>
              {surface.actions.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="btn ghost sm"
                  aria-pressed={row.id === actionId}
                  onClick={() => {
                    setActionId(row.id);
                    setTarget(null);
                    setFile(null);
                    setFileUrl(null);
                    setQuery("");
                    setReview(null);
                  }}
                >
                  {t(row.label_key)}
                </button>
              ))}
            </div>

            {action && !action.runnable ? <p className="idp-job">{t(action.pending_key)}</p> : null}

            {action?.runnable ? (
              <div className="idp-job">
                <p>{t(action.pick_key)}</p>
                <div className="idp-targets">
                  {action.targets
                    .filter((row) => row.ready)
                    .map((row) => (
                      <button
                        key={row.doctype}
                        type="button"
                        className="btn ghost sm"
                        aria-pressed={target === row.doctype}
                        onClick={() => setTarget(row.doctype)}
                      >
                        {t(row.label_key)}
                      </button>
                    ))}
                </div>
                {action.targets.some((row) => !row.ready) ? (
                  <p>
                    {action.targets
                      .filter((row) => !row.ready)
                      .map((row) => t(row.label_key))
                      .join(", ")}{" "}
                    · {t("idp.noRoute")}
                  </p>
                ) : null}
                {action.needs_file ? (
                  <label className="idp-file">
                    {t("idp.fileLabel")}
                    <input
                      type="file"
                      accept={surface.accept.join(",")}
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setReview(null);
                        setFileUrl(null);
                      }}
                    />
                  </label>
                ) : null}
                {action.needs_query ? (
                  <label className="idp-file">
                    {t(action.query_key || "idp.query.doc")}
                    <input
                      type="text"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setReview(null);
                      }}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !target || (action.needs_file && !file) || (action.needs_query && !query.trim())}
                  onClick={readFile}
                >
                  {busy ? t(action.needs_file ? "idp.reading" : "idp.working") : t(action.run_key)}
                </button>
              </div>
            ) : null}

            {review ? (
              <ReviewBlock
                review={review}
                writes={writes}
                busy={busy}
                onWrite={(field, value) =>
                  setWrites((rows) => rows.map((row) => (row.field === field ? { ...row, value } : row)))
                }
                onSave={saveDraft}
                onOpen={nav}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ReviewBlock({
  review,
  writes,
  busy,
  onWrite,
  onSave,
  onOpen,
}: {
  review: Review;
  writes: Write[];
  busy: boolean;
  onWrite: (field: string, value: string) => void;
  onSave: (submit?: boolean) => void;
  onOpen: (route: string) => void;
}) {
  return (
    <div className="idp-job" role="status" aria-live="polite">
      {review.error_key ? <p>{t(review.error_key)}</p> : null}
      {review.detail ? <p>{review.detail}</p> : null}
      {review.step === "saved" ? <p>{t("idp.saved")}</p> : null}
      {review.step === "submitted" ? <p>{t("idp.submittedNow")}</p> : null}
      {review.route && review.error_key && review.name ? (
        <button type="button" className="btn ghost" onClick={() => onOpen(review.route as string)}>
          {review.name}
        </button>
      ) : null}
      {review.step === "deleted" ? <p>{t("idp.deleted")}</p> : null}
      {review.used_llm ? <p className="idp-kicker">{t("idp.modelUsed")}</p> : null}
      {review.lines && review.lines.length > 0 ? (
        <>
          <p className="idp-kicker">{t("idp.readTitle")}</p>
          <div className="idp-read">
            {review.lines.map((line) => (
              <div key={line.label_key}>
                <span>{fieldLabel(line.label_key)}</span>
                <b>{line.value}</b>
              </div>
            ))}
          </div>
        </>
      ) : null}
      {review.items && review.items.length > 0 ? (
        <ul className="idp-notes">
          {review.items.map((item) => (
            <li key={item.label}>{item.label}</li>
          ))}
        </ul>
      ) : null}
      {review.gaps && review.gaps.length > 0 ? (
        <>
          <p className="idp-kicker">{t("idp.still")}</p>
          <ul className="idp-notes">
            {review.gaps.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {review.matches && review.matches.length > 0 ? (
        <ul className="idp-notes">
          {review.matches.map((row) => (
            <li key={row.name}>
              {row.route ? (
                <button type="button" className="btn ghost sm" onClick={() => onOpen(row.route as string)}>
                  {row.label}
                </button>
              ) : (
                row.label
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {review.diffs && review.diffs.length > 0 ? (
        <ul className="idp-notes">
          {review.diffs.map((row) => (
            <li key={`${row.label_key}-${row.after}`}>
              {fieldLabel(row.label_key)}: {row.before} → {row.after}
            </li>
          ))}
        </ul>
      ) : null}
      {review.step === "review" && writes.length > 0 ? (
        <>
          <p className="idp-kicker">{t("idp.write")}</p>
          {writes.map((row) => {
            const fieldId = `idp-write-${row.field}`;
            return (
              <label className="idp-file" key={row.field} htmlFor={fieldId}>
                {fieldLabel(row.label_key)}
                {row.options && row.options.length > 0 ? (
                  <select
                    id={fieldId}
                    value={row.value}
                    onChange={(event) => onWrite(row.field, event.target.value)}
                  >
                    <option value="" />
                    {row.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={fieldId}
                    type={row.field.endsWith("date") ? "date" : "text"}
                    value={row.value}
                    onChange={(event) => onWrite(row.field, event.target.value)}
                  />
                )}
              </label>
            );
          })}
        </>
      ) : null}
      {review.can_save || review.can_delete ? (
        <div className="idp-jobs">
          <button type="button" className="btn" disabled={busy} onClick={() => onSave(false)}>
            {busy ? t("idp.saving") : t(review.save_key || "idp.save")}
          </button>
          {review.can_submit ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => onSave(true)}>
              {t("idp.submit")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function fieldLabel(key: string): string {
  const label = t(key);
  if (label !== key) return label;
  const raw = key.startsWith("idp.field.") ? key.slice("idp.field.".length) : key;
  return raw.replaceAll("_", " ");
}

function trapTab(event: KeyboardEvent, root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea");
  const list = [...nodes].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
  if (list.length === 0) return;
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

async function postFile(file: File): Promise<Record<string, unknown>> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/method/${METHOD.idpUpload}`, {
    method: "POST",
    headers: { "X-Frappe-CSRF-Token": window.csrf_token || "" },
    body,
  });
  return readMessage(res);
}

async function postForm(method: string, args: Record<string, string>): Promise<Review> {
  const res = await fetch(`/api/method/${method}`, {
    method: "POST",
    headers: {
      "X-Frappe-CSRF-Token": window.csrf_token || "",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(args),
  });
  return readMessage(res) as Promise<Review>;
}

async function readMessage(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json();
  if (!res.ok || data.exc) {
    throw new Error(typeof data.message === "string" ? data.message : t("idp.readFailed"));
  }
  return (data.message ?? data) as Record<string, unknown>;
}
