/**
 * Desk form page: sections, columns, controls, grids — like ERPNext form layout.
 * Callers: DocTabShell for every non-Connections tab on sidebar DocTypes.
 * API: form_layout sections/columns; values from loaded doc (read-only).
 * Mirrors frappe desk form-section / form-column / frappe-control / form-grid.
 * User: keep the design of documents, tabs, and fields similar to frappe/erpnext.
 */
import { date, money } from "../lib/format";
import type { DocTab, LayoutField } from "../lib/docLayout";

type Props = {
  tab: DocTab;
  doc?: Record<string, unknown> | null;
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

function Control({ field, doc }: { field: LayoutField; doc: Record<string, unknown> }) {
  if (field.fieldtype === "Table" || field.fieldtype === "Table MultiSelect") return null;
  const raw = doc[field.fieldname];
  const value = formatValue(field, raw);
  const isCheck = field.fieldtype === "Check";
  const isText = field.fieldtype === "Text" || field.fieldtype === "Small Text"
    || field.fieldtype === "Long Text" || field.fieldtype === "Text Editor"
    || field.fieldtype === "HTML Editor" || field.fieldtype === "Code";

  const reqd = !!Number(field.reqd);
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
        <div className={`tm-control-check${Number(raw) ? " on" : ""}`} aria-checked={!!Number(raw)} role="checkbox">
          {Number(raw) ? "✓" : ""}
        </div>
      ) : (
        <div className={`tm-control-value${isText ? " multiline" : ""}${!value ? " empty" : ""}`}>
          {value || "—"}
        </div>
      )}
    </div>
  );
}

function FormGrid({ field, rows }: { field: LayoutField; rows: Record<string, unknown>[] }) {
  const skip = new Set([
    "name", "owner", "creation", "modified", "modified_by",
    "parent", "parentfield", "parenttype", "idx", "docstatus",
  ]);
  const keys = rows.length
    ? Object.keys(rows[0]).filter((k) => !k.startsWith("_") && !skip.has(k)).slice(0, 8)
    : [];

  return (
    <div className="tm-form-grid-wrap">
      <div className="tm-grid-title">
        {field.label}
        {Number(field.reqd) ? <span className="tm-req" aria-hidden="true">*</span> : null}
      </div>
      <div className="tm-form-grid">
        {rows.length === 0 ? (
          <div className="tm-grid-empty">No rows yet</div>
        ) : (
          <table>
            <thead>
              <tr className="tm-grid-heading-row">
                <th className="tm-grid-row-check">#</th>
                {keys.map((k) => (
                  <th key={k}>{k.replace(/_/g, " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.name || i)} className="tm-grid-row">
                  <td className="tm-grid-row-check">{i + 1}</td>
                  {keys.map((k) => {
                    const v = row[k];
                    const shown =
                      v === undefined || v === null || v === ""
                        ? ""
                        : typeof v === "object"
                          ? ""
                          : String(v);
                    return <td key={k}>{shown || "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Column({ fields, doc }: { fields: LayoutField[]; doc: Record<string, unknown> }) {
  const scalars = fields.filter((f) => f.fieldtype !== "Table" && f.fieldtype !== "Table MultiSelect");
  const tables = fields.filter((f) => f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect");
  return (
    <div className="tm-form-column">
      {scalars.length ? (
        <div className="tm-control-stack">
          {scalars.map((f) => (
            <Control key={f.fieldname} field={f} doc={doc} />
          ))}
        </div>
      ) : null}
      {tables.map((f) => {
        const raw = doc[f.fieldname];
        const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
        return <FormGrid key={f.fieldname} field={f} rows={rows} />;
      })}
    </div>
  );
}

export default function DeskTabPanel({ tab, doc }: Props) {
  const sections = tab.sections ?? [];
  if (!doc) {
    return <div className="tm-form-page"><p className="tm-form-empty">—</p></div>;
  }
  if (!sections.length) {
    return <div className="tm-form-page"><p className="tm-form-empty">—</p></div>;
  }

  return (
    <div className="tm-form-page" data-tab={tab.id}>
      {sections.map((sec, idx) => {
        const allFields = sec.columns.flat();
        if (!allFields.length) return null;
        const nCols = Math.max(1, sec.columns.length);
        return (
          <section
            key={sec.id || `${tab.id}-${idx}`}
            className={`tm-form-section${sec.label ? "" : " unlabeled"}`}
          >
            {sec.label ? (
              <div className="tm-section-head">
                <span className="tm-section-title">{sec.label}</span>
              </div>
            ) : null}
            <div className={`tm-section-body cols-${nCols}`}>
              {sec.columns.map((col, i) => (
                <Column key={i} fields={col} doc={doc} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
