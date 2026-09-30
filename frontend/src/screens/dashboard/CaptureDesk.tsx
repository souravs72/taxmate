/**
 * Scan panel. Renders the dashboard IDP payload and decides nothing.
 * The backend names the jobs, the documents, proposals, and whether a draft can be saved.
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

type Stage = { key: string; label_key: string; status?: string };

type Surface = {
  title_key: string;
  notices: string[];
  accept: string[];
  read_stages?: Stage[];
  actions: Action[];
};

type Write = { field: string; label_key: string; value: string; options?: string[] };

type Proposal = {
  key: string;
  doctype: string;
  title: string;
  consent_label_key: string;
  confirmed: boolean;
  required_fields: Write[];
  optional_fields: Write[];
};

type Review = {
  ok?: boolean;
  step?: string;
  error_key?: string | null;
  detail?: string | null;
  lines?: { label_key: string; value: string }[];
  items?: { label: string }[];
  gaps?: string[];
  writes?: Write[];
  proposals?: Proposal[];
  stage_log?: Stage[];
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
      <button ref={openRef} type="button" className="btn scanbtn" onClick={() => setOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3.2 6.2V3.4h2.8M14.8 6.2V3.4h-2.8M3.2 11.8v2.8h2.8M14.8 11.8v2.8h-2.8M2.8 9h12.4" />
        </svg>
        {t("idp.open")}
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
  const [proposals, setProposals] = useState<Proposal[]>([]);

  const action = surface?.actions.find((row) => row.id === actionId) ?? null;
  const stages = surface?.read_stages ?? [];

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  async function readFile() {
    if (lock.current || !action || !target) return;
    if (action.needs_file && !file) return;
    if (action.needs_query && !query.trim()) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setProposals([]);
    let stopped = false;
    const slow = window.setTimeout(() => {
      stopped = true;
      lock.current = false;
      setBusy(false);
      setReview({ ok: false, error_key: "idp.readSlow" });
    }, 100_000);
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
      if (stopped) return;
      setReview(result);
      setWrites(Array.isArray(result.writes) ? result.writes : []);
      setProposals(Array.isArray(result.proposals) ? cloneProposals(result.proposals) : []);
    } catch (err) {
      if (stopped) return;
      setReview({ ok: false, error_key: "idp.readFailed", detail: readableError(err).join(" ") });
    } finally {
      window.clearTimeout(slow);
      if (!stopped) {
        lock.current = false;
        setBusy(false);
      }
    }
  }

  async function saveDraft(submit = false) {
    if (lock.current || !action || !target) return;
    if (action.needs_file && !fileUrl) return;
    if (!proposalsReady(proposals)) return;
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
        proposals: JSON.stringify(proposals),
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

  const liveStages = busy
    ? stages.map((row, index) => ({
        ...row,
        status: index === 0 ? "done" : index === 1 ? "active" : "pending",
      }))
    : review?.stage_log ?? [];

  const reviewReady = proposalsReady(proposals);
  // Match draft_instructions: confirmed proposals unlock save even when schema
  // still lists ERPNext auto-filled row fields as errors.
  const canSave = Boolean(
    review &&
      reviewReady &&
      (review.can_delete || review.can_save || proposals.length > 0)
  );
  const canSubmit = Boolean(
    review && reviewReady && (review.can_submit || (canSave && proposals.length > 0 && !review.can_delete))
  );
  const consentPending = proposals.some((row) => !row.confirmed);
  const fieldsPending = proposals.some(
    (row) =>
      row.confirmed &&
      row.required_fields.some((field) => !String(field.value || "").trim())
  );
  const blockHint = !review
    ? null
    : !reviewReady
      ? consentPending
        ? "idp.propose.needConsent"
        : fieldsPending
          ? "idp.propose.needFields"
          : "idp.propose.needConsent"
      : review.gaps && review.gaps.length > 0
        ? "idp.blocked.gaps"
        : !canSave
          ? "idp.blocked.save"
          : null;

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

        <div className="idp-body">
          {res.error ? <p>{readableError(res.error).join(" ")}</p> : null}
          {!surface && res.isLoading ? <p>{t("idp.loading")}</p> : null}

          {surface ? (
            <>
              {!review ? (
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
                          setProposals([]);
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
                              setProposals([]);
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
                              setProposals([]);
                            }}
                          />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        className="btn"
                        disabled={
                          busy || !target || (action.needs_file && !file) || (action.needs_query && !query.trim())
                        }
                        onClick={readFile}
                      >
                        {busy ? t(action.needs_file ? "idp.reading" : "idp.working") : t(action.run_key)}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="idp-job">
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => {
                      setReview(null);
                      setProposals([]);
                      setWrites([]);
                      setFile(null);
                      setFileUrl(null);
                    }}
                  >
                    {t("idp.again")}
                  </button>
                </div>
              )}

              {liveStages.length > 0 ? <StageList stages={liveStages} /> : null}
              {busy ? <p className="idp-hint">{t("idp.readingWait")}</p> : null}

              {review ? (
                <ReviewBlock
                  review={review}
                  writes={writes}
                  proposals={proposals}
                  onWrite={(field, value) =>
                    setWrites((rows) => rows.map((row) => (row.field === field ? { ...row, value } : row)))
                  }
                  onProposal={setProposals}
                  onOpen={nav}
                />
              ) : null}
            </>
          ) : null}
        </div>

        {review ? (
          <div className="idp-foot">
            {proposals.length > 0 ? <p className="idp-hint">{t("idp.propose.onSave")}</p> : null}
            {!canSave && review?.detail ? <p className="idp-hint">{review.detail}</p> : null}
            {blockHint && !canSave && !review?.detail ? <p className="idp-hint">{t(blockHint)}</p> : null}
            <div className="idp-jobs">
              <button type="button" className="btn" disabled={busy || !canSave} onClick={() => saveDraft(false)}>
                {busy ? t("idp.saving") : t(review.save_key || "idp.save")}
              </button>
              {canSubmit && !review.can_delete ? (
                <button type="button" className="btn ghost" disabled={busy || !canSave} onClick={() => saveDraft(true)}>
                  {t("idp.submit")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StageList({ stages }: { stages: Stage[] }) {
  return (
    <ol className="idp-stages" aria-live="polite" aria-label={t("idp.stages")}>
      {stages.map((row) => (
        <li key={row.key} data-status={row.status || "pending"}>
          {t(row.label_key)}
        </li>
      ))}
    </ol>
  );
}

function ReviewBlock({
  review,
  writes,
  proposals,
  onWrite,
  onProposal,
  onOpen,
}: {
  review: Review;
  writes: Write[];
  proposals: Proposal[];
  onWrite: (field: string, value: string) => void;
  onProposal: (rows: Proposal[] | ((prev: Proposal[]) => Proposal[])) => void;
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
      {proposals.length > 0 ? (
        <>
          <p className="idp-kicker">{t("idp.propose.title")}</p>
          {proposals.map((row) => (
            <ProposalCard
              key={row.key}
              proposal={row}
              onChange={(next) =>
                onProposal((rows) => rows.map((item) => (item.key === next.key ? next : item)))
              }
            />
          ))}
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
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="req" aria-hidden="true">
      *
    </span>
  );
}

function FieldLabel({ labelKey, required }: { labelKey: string; required?: boolean }) {
  return (
    <span className="idp-label-text">
      {fieldLabel(labelKey)}
      {required ? <RequiredMark /> : null}
    </span>
  );
}

function ProposalCard({
  proposal,
  onChange,
}: {
  proposal: Proposal;
  onChange: (row: Proposal) => void;
}) {
  const consentId = `idp-consent-${proposal.key}`;
  function patchField(bucket: "required_fields" | "optional_fields", field: string, value: string) {
    onChange({
      ...proposal,
      [bucket]: proposal[bucket].map((row) => (row.field === field ? { ...row, value } : row)),
    });
  }
  return (
    <fieldset className="idp-propose">
      <legend>{proposal.title}</legend>
      <label className="idp-consent" htmlFor={consentId}>
        <input
          id={consentId}
          type="checkbox"
          checked={proposal.confirmed}
          onChange={(event) => onChange({ ...proposal, confirmed: event.target.checked })}
        />
        {t(proposal.consent_label_key)}
      </label>
      {[...proposal.required_fields, ...proposal.optional_fields].map((row) => {
        const fieldId = `idp-prop-${proposal.key}-${row.field}`;
        const required = proposal.required_fields.some((item) => item.field === row.field);
        return (
          <label className="idp-file" key={row.field} htmlFor={fieldId}>
            <FieldLabel labelKey={row.label_key} required={required} />
            {row.options && row.options.length > 0 ? (
              <select
                id={fieldId}
                value={row.value}
                required={required}
                onChange={(event) =>
                  patchField(required ? "required_fields" : "optional_fields", row.field, event.target.value)
                }
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
                type="text"
                value={row.value}
                required={required}
                onChange={(event) =>
                  patchField(required ? "required_fields" : "optional_fields", row.field, event.target.value)
                }
              />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

function cloneProposals(rows: Proposal[]): Proposal[] {
  return rows.map((row) => ({
    ...row,
    confirmed: Boolean(row.confirmed),
    required_fields: (row.required_fields || []).map((field) => ({ ...field, value: field.value || "" })),
    optional_fields: (row.optional_fields || []).map((field) => ({ ...field, value: field.value || "" })),
  }));
}

function proposalsReady(rows: Proposal[]): boolean {
  if (rows.length === 0) return true;
  return rows.every(
    (row) =>
      row.confirmed &&
      row.required_fields.every((field) => String(field.value || "").trim().length > 0)
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
