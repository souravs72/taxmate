/**
 * Desk form page: sections, columns, controls, grids — like ERPNext form layout.
 * Callers: DocTabShell for every non-Connections tab on sidebar DocTypes.
 * API: form_layout sections/columns. View is read-only; onChange makes controls editable.
 */
import { t } from "../i18n/strings";
import { fieldVisible } from "../lib/dependsOn";
import type { DocTab, LayoutField } from "../lib/docLayout";
import DeskControl from "./DeskControl";

type Props = {
  tab: DocTab;
  doc?: Record<string, unknown> | null;
  onChange?: (fieldname: string, value: unknown) => void;
  disabled?: boolean;
};

const META_KEYS = new Set([
  "name", "owner", "creation", "modified", "modified_by",
  "parent", "parentfield", "parenttype", "idx", "docstatus",
]);

function gridColumns(field: LayoutField, rows: Record<string, unknown>[]): LayoutField[] {
  if (field.columns?.length) return field.columns;
  const keys = rows.length
    ? Object.keys(rows[0]).filter((k) => !k.startsWith("_") && !META_KEYS.has(k)).slice(0, 8)
    : [];
  return keys.map((k) => ({ fieldname: k, label: k.replace(/_/g, " "), fieldtype: "Data" }));
}

function FormGrid({
  field, rows, onChange, disabled,
}: {
  field: LayoutField;
  rows: Record<string, unknown>[];
  onChange?: (fieldname: string, value: unknown) => void;
  disabled?: boolean;
}) {
  const cols = gridColumns(field, rows);
  const editable = !!onChange && !disabled && !Number(field.read_only);
  const child = field.options || "";

  function patch(next: Record<string, unknown>[]) {
    onChange?.(field.fieldname, next);
  }

  function setCell(i: number, name: string, value: unknown) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [name]: value } : r));
    patch(next);
  }

  function addRow() {
    patch([...rows, { doctype: child, idx: rows.length + 1 }]);
  }

  function removeRow(i: number) {
    patch(rows.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, idx: idx + 1 })));
  }

  return (
    <div className="tm-form-grid-wrap">
      <div className="tm-grid-title">
        {field.label}
        {Number(field.reqd) ? <span className="tm-req" aria-hidden="true">*</span> : null}
      </div>
      <div className="tm-form-grid">
        {rows.length === 0 && !editable ? (
          <div className="tm-grid-empty">{t("list.empty")}</div>
        ) : (
          <table>
            <thead>
              <tr className="tm-grid-heading-row">
                <th className="tm-grid-row-check">#</th>
                {cols.map((c) => (
                  <th key={c.fieldname}>
                    {c.label}
                    {Number(c.reqd) ? <span className="tm-req" aria-hidden="true">*</span> : null}
                  </th>
                ))}
                {editable ? <th className="tm-grid-row-check" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.name || i)} className="tm-grid-row">
                  <td className="tm-grid-row-check">{i + 1}</td>
                  {cols.map((c) => (
                    <td key={c.fieldname}>
                      <DeskControl
                        field={c}
                        doc={row}
                        onChange={editable ? (fn, v) => setCell(i, fn, v) : undefined}
                      />
                    </td>
                  ))}
                  {editable ? (
                    <td className="tm-grid-row-check">
                      <button type="button" className="btn quiet sm" onClick={() => removeRow(i)}>
                        {t("common.remove")}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {editable ? (
          <div className="tm-grid-actions">
            <button type="button" className="btn ghost sm" onClick={addRow}>{t("soc.addLine")}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Column({
  fields, doc, onChange, disabled,
}: {
  fields: LayoutField[];
  doc: Record<string, unknown>;
  onChange?: (fieldname: string, value: unknown) => void;
  disabled?: boolean;
}) {
  /* Desk shows every layout field that passes depends_on — empty values stay blank
     so columns stay aligned (hiding empties collapses the grid unlike ERPNext). */
  const visible = fields.filter((f) => fieldVisible(f.depends_on, doc));
  const scalars = visible.filter((f) => f.fieldtype !== "Table" && f.fieldtype !== "Table MultiSelect");
  const tables = visible.filter((f) => f.fieldtype === "Table" || f.fieldtype === "Table MultiSelect");
  return (
    <div className="tm-form-column">
      {scalars.length ? (
        <div className="tm-control-stack">
          {scalars.map((f) => (
            <DeskControl key={f.fieldname} field={f} doc={doc} onChange={onChange} disabled={disabled} />
          ))}
        </div>
      ) : null}
      {tables.map((f) => {
        const raw = doc[f.fieldname];
        const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
        return (
          <FormGrid
            key={f.fieldname}
            field={f}
            rows={rows}
            onChange={onChange}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}

export default function DeskTabPanel({ tab, doc, onChange, disabled }: Props) {
  const sections = tab.sections ?? [];
  const data = doc ?? {};
  const emptyView = !onChange && (!doc || !Object.keys(doc).length);

  if (emptyView || !sections.length) {
    return <div className="tm-form-page"><p className="tm-form-empty">—</p></div>;
  }

  return (
    <div className="tm-form-page" data-tab={tab.id}>
      {sections.map((sec, idx) => {
        const allFields = sec.columns.flat().filter((f) => fieldVisible(f.depends_on, data));
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
                <Column key={i} fields={col} doc={data} onChange={onChange} disabled={disabled} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
