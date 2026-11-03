/**
 * SourceDocPicker — load items from a submitted source via a catalogued make_* mapper.
 *
 * Callers: InvoiceForm, SalesOrderCreate, DeliveryNoteForm, Purchase forms.
 */
import { useContext, useId, useState } from "react";
import { FrappeContext } from "frappe-react-sdk";

import { readableError } from "../lib/frappe";
import { t } from "../i18n/strings";
import { Field } from "./ui";
import LinkField from "./LinkField";

export type SourceSpec = {
  label: string;
  doctype: string;
  method: string;
  /** Mapper argument name, usually source_name */
  arg?: string;
  /** Desk get-items filters. Defaults to submitted documents. */
  filters?: unknown;
};

type Props = {
  sources: SourceSpec[];
  onMapped: (doc: Record<string, unknown>) => void;
  disabled?: boolean;
  extraArgs?: Record<string, unknown>;
};

export default function SourceDocPicker({ sources, onMapped, disabled, extraArgs }: Props) {
  const id = useId();
  const ctx = useContext(FrappeContext);
  const call = ctx?.call;
  const [docType, setDocType] = useState<string>(sources[0]?.doctype ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);

  if (!sources.length) return null;

  const src = sources.find((s) => s.doctype === docType) || sources[0];
  const typeId = `${id}-type`;
  const docId = `${id}-doc`;

  async function load() {
    if (!name || !src || !call) return;
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = {
        [src.arg || "source_name"]: name,
        ...(extraArgs || {}),
      };
      const r = (await call.post(src.method, payload)) as { message?: Record<string, unknown> };
      const mapped = r?.message;
      if (!mapped) throw new Error(t("txn.mapEmpty"));
      const body: Record<string, unknown> = { ...mapped };
      delete body.name;
      delete body.__islocal;
      delete body.__unsaved;
      onMapped(body);
      setErr(null);
    } catch (e) {
      setErr(readableError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fg" style={{ alignItems: "end" }}>
      <Field label={t("txn.sourceType")} htmlFor={typeId}>
        <select
          id={typeId}
          className="ctl"
          value={src.doctype}
          disabled={disabled || busy}
          onChange={(e) => {
            setDocType(e.target.value);
            setName("");
            setErr(null);
          }}
        >
          {sources.map((s) => (
            <option key={s.doctype} value={s.doctype}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("txn.sourceDoc")} htmlFor={docId}>
        <LinkField
          doctype={src.doctype}
          value={name}
          onChange={(v) => {
            setName(v);
            setErr(null);
          }}
          disabled={disabled || busy}
          filters={src.filters ?? [["docstatus", "=", 1]]}
        />
      </Field>
      <button
        type="button"
        className="btn ghost"
        disabled={disabled || busy || !name}
        aria-busy={busy || undefined}
        onClick={() => void load()}
      >
        {busy ? t("txn.fetching") : t("txn.fetchItems")}
      </button>
      {err?.length ? (
        <div role="alert" className="err" style={{ gridColumn: "1 / -1" }}>
          {err.map((line) => (
            <p key={line} style={{ margin: 0 }}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
