/**
 * One Desk control: label + input, same fieldtypes as frappe.ui.form.Control.
 * Callers: DeskTabPanel. Link search: taxmate.api.resource.search_link.
 */
import { useId } from "react";

import { date, money } from "../lib/format";
import type { LayoutField } from "../lib/docLayout";
import LinkField from "./LinkField";

type Props = {
  field: LayoutField;
  doc: Record<string, unknown>;
  onChange?: (fieldname: string, value: unknown) => void;
  disabled?: boolean;
};

function formatValue(field: LayoutField, raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw === "object") return "";
  const ft = field.fieldtype;
  if (ft === "Check") return Number(raw) ? "✓" : "";
  if (ft === "Date") return date(String(raw));
  if (ft === "Currency" || ft === "Float" || ft === "Percent") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    if (ft === "Percent") return `${n}%`;
    if (ft === "Currency") return money(n);
    return String(n);
  }
  if (ft === "Text Editor" || ft === "HTML Editor") {
    return String(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return String(raw);
}

function isHtmlField(field: LayoutField): boolean {
  return field.fieldtype === "Text Editor" || field.fieldtype === "HTML Editor" || field.fieldtype === "HTML";
}

function viewHtml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function selectOptions(options: string | null | undefined): string[] {
  if (!options) return [];
  return options.split("\n").map((s) => s.trim()).filter(Boolean);
}

function asStr(raw: unknown): string {
  if (raw == null) return "";
  return String(raw);
}

export default function DeskControl({ field, doc, onChange, disabled }: Props) {
  const id = useId();
  if (field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") return null;
  const raw = doc[field.fieldname];
  const reqd = !!Number(field.reqd);
  const isCheck = field.fieldtype === "Check";
  const isText = field.fieldtype === "Text" || field.fieldtype === "Small Text"
    || field.fieldtype === "Long Text" || field.fieldtype === "Text Editor"
    || field.fieldtype === "HTML Editor" || field.fieldtype === "Code"
    || field.fieldtype === "Markdown Editor";
  const locked = disabled || !!Number(field.read_only) || !!Number(field.is_virtual);
  const editable = !!onChange && !locked;

  if (!editable) {
    const value = formatValue(field, raw);
    const html = isHtmlField(field) && raw ? viewHtml(raw) : "";
    return (
      <div
        className={`tm-control${isCheck ? " check" : ""}${reqd ? " reqd" : ""}`}
        data-fieldname={field.fieldname}
        data-fieldtype={field.fieldtype}
      >
        <div className="tm-control-label">
          {field.label}
          {reqd ? <span className="tm-req" aria-hidden="true">*</span> : null}
        </div>
        {isCheck ? (
          <div className={`tm-control-check${Number(raw) ? " on" : ""}`} aria-hidden="true">
            {Number(raw) ? "✓" : ""}
          </div>
        ) : html ? (
          <div className="tm-control-html" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className={`tm-control-value${isText ? " multiline" : ""}${!value ? " empty" : ""}`}>
            {value || "—"}
          </div>
        )}
      </div>
    );
  }

  const set = (value: unknown) => onChange(field.fieldname, value);

  if (isCheck) {
    const on = !!Number(raw);
    return (
      <label
        className={`tm-control check${reqd ? " reqd" : ""}`}
        data-fieldname={field.fieldname}
        data-fieldtype="Check"
      >
        <input
          id={id}
          type="checkbox"
          checked={on}
          onChange={(e) => set(e.target.checked ? 1 : 0)}
        />
        <span className="tm-control-label">
          {field.label}
          {reqd ? <span className="tm-req" aria-hidden="true">*</span> : null}
        </span>
      </label>
    );
  }

  const label = (
    <div className="tm-control-label">
      <label htmlFor={id}>
        {field.label}
        {reqd ? <span className="tm-req" aria-hidden="true">*</span> : null}
      </label>
    </div>
  );

  if (field.fieldtype === "Link" && field.options) {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Link">
        {label}
        <LinkField id={id} doctype={field.options} value={asStr(raw)} onChange={set} />
      </div>
    );
  }

  if (field.fieldtype === "Dynamic Link" && field.options) {
    const dt = asStr(doc[field.options]);
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Dynamic Link">
        {label}
        {dt ? (
          <LinkField id={id} doctype={dt} value={asStr(raw)} onChange={set} />
        ) : (
          <input id={id} className="ctl" name={field.fieldname} value={asStr(raw)} autoComplete="off" onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  }

  if (field.fieldtype === "Select") {
    const opts = selectOptions(field.options);
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Select">
        {label}
        <select id={id} className="ctl" name={field.fieldname} value={asStr(raw)} onChange={(e) => set(e.target.value)}>
          <option value="" />
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  if (isText) {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype={field.fieldtype}>
        {label}
        <textarea
          id={id}
          className="ctl"
          name={field.fieldname}
          rows={field.fieldtype === "Small Text" ? 3 : 6}
          value={asStr(raw)}
          onChange={(e) => set(e.target.value)}
        />
      </div>
    );
  }

  if (field.fieldtype === "Date") {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Date">
        {label}
        <input id={id} className="ctl" type="date" name={field.fieldname} value={asStr(raw).slice(0, 10)} onChange={(e) => set(e.target.value)} />
      </div>
    );
  }

  if (field.fieldtype === "Datetime") {
    const v = asStr(raw).replace(" ", "T").slice(0, 16);
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Datetime">
        {label}
        <input
          id={id}
          className="ctl"
          type="datetime-local"
          name={field.fieldname}
          value={v}
          onChange={(e) => set(e.target.value.replace("T", " "))}
        />
      </div>
    );
  }

  if (field.fieldtype === "Time") {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Time">
        {label}
        <input id={id} className="ctl" type="time" name={field.fieldname} value={asStr(raw).slice(0, 8)} onChange={(e) => set(e.target.value)} />
      </div>
    );
  }

  if (field.fieldtype === "Password") {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Password">
        {label}
        <input id={id} className="ctl" type="password" name={field.fieldname} value={asStr(raw)} autoComplete="off" onChange={(e) => set(e.target.value)} />
      </div>
    );
  }

  if (field.fieldtype === "Color") {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype="Color">
        {label}
        <input id={id} className="ctl" type="color" name={field.fieldname} value={asStr(raw) || "#000000"} onChange={(e) => set(e.target.value)} />
      </div>
    );
  }

  const numeric = field.fieldtype === "Int" || field.fieldtype === "Float"
    || field.fieldtype === "Currency" || field.fieldtype === "Percent" || field.fieldtype === "Rating";
  if (numeric) {
    return (
      <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype={field.fieldtype}>
        {label}
        <input
          id={id}
          className="ctl"
          type="number"
          name={field.fieldname}
          inputMode={field.fieldtype === "Int" ? "numeric" : "decimal"}
          step={field.fieldtype === "Int" ? 1 : "any"}
          value={raw == null || raw === "" ? "" : String(raw)}
          onChange={(e) => {
            const s = e.target.value;
            if (s === "") { set(null); return; }
            const n = Number(s);
            set(Number.isFinite(n) ? n : s);
          }}
        />
      </div>
    );
  }

  return (
    <div className="tm-control" data-fieldname={field.fieldname} data-fieldtype={field.fieldtype}>
      {label}
      <input
        id={id}
        className="ctl"
        name={field.fieldname}
        value={asStr(raw)}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );
}
