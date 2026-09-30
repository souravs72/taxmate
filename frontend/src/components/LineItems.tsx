/**
 * LineItems — one document's line rows, as a table on a desktop and as one
 * card per line on a phone.
 *
 * Why this exists: eighteen form screens each wrote their own line table, and
 * at 393px those tables are 500–1,800px wide — you drag a table several
 * screens sideways to type one line. Rather than convert eighteen screens
 * eighteen different ways, each screen now hands the same component a list of
 * fields and says which belong on the face of a phone card.
 *
 * The desktop table is deliberately identical to what the screens rendered
 * before: same columns in the same order, same widths, same `.twrap` wrapper,
 * same `n` classes. Callers pass the per-column style they used to write
 * inline, so nothing moves above 760px.
 *
 * Callers: InvoiceForm, PurchaseInvoiceForm, StockEntryForm (and, from round
 * 3b, the rest). JournalEntryForm has its own card layout from round 2 and is
 * not converted yet.
 */
import { useState, type CSSProperties, type ReactNode } from "react";

import { t } from "../i18n/strings";
import { useIsPhone } from "../lib/useMedia";

import "../styles/line-items.css";

/**
 * Where a field goes on a phone card.
 *
 *  title   — the one field that names the line. Exactly one per row.
 *  primary — on the face of the card, beside its siblings.
 *  more    — behind the "More" toggle. The default, so a field has to earn
 *            its place on a phone rather than arrive there by accident.
 */
export type LineSlot = "title" | "primary" | "more";

export type LineField<Row> = {
  /** Stable across renders; used as the React key. */
  key: string;
  /** Already translated — the component never calls t() on caller strings. */
  label: string;
  /** The editor, or read-only value, for this field on this row. */
  render: (row: Row, index: number) => ReactNode;
  slot?: LineSlot;
  /** Hide this field for this row (the HS/SAC cell on a service line, say). */
  when?: (row: Row) => boolean;
  /** Right-aligns the column and adds the `n` class the app uses for figures. */
  numeric?: boolean;
  /** Exactly the inline style the screen used to put on its own th / td. */
  th?: CSSProperties;
  td?: CSSProperties;
  /**
   * The desktop column heading, when it differs from the card's field label.
   * A tick column had a blank `<th>` and still needs a label on a card, so
   * pass `thLabel: ""` there rather than letting the card's wording appear
   * as a new column heading. Defaults to `label`.
   */
  thLabel?: ReactNode;
  /** The class the screen had on its own `<th>` / `<td>`, beside `n`. */
  thClass?: string;
  tdClass?: string;
};

export type LineItemsProps<Row> = {
  rows: Row[];
  fields: LineField<Row>[];
  /** Omit to make the rows non-removable (a locked invoice, say). */
  onRemove?: (index: number) => void;
  /** The leading `#` column. Off for tables that never had one. */
  showIndex?: boolean;
  /** Renders the "add a line" button under the rows when both are given. */
  addLabel?: string;
  onAdd?: () => void;
  /**
   * "bar" (the default) is the sunk `.addrow` strip that sits flush at the
   * bottom of a card whose body padding is off. Screens that keep their card
   * padding had a plain button instead — "inline" keeps that on a desktop and
   * still gives a phone a full-width 44px target.
   */
  addWrap?: "bar" | "inline";
  /**
   * Extra class on a row, for state a screen shows by tinting it — the ticked
   * invoices on a payment, say. Applied to the `<tr>` and to the card.
   */
  rowClass?: (row: Row, index: number) => string | undefined;
  /**
   * A totals row. Rendered inside `<tfoot>` on a desktop (pass the `<tr>`),
   * and after the cards on a phone, where a table footer has nothing to
   * align to. Screens with a `<tfoot>` lost it otherwise.
   */
  footer?: ReactNode;
  /** The same totals, laid out for a card. Falls back to `footer`. */
  footerCard?: ReactNode;
  /**
   * Whether the non-face fields hide behind a "More" toggle. True on a form,
   * where collapsing keeps the fields you type every time within reach.
   *
   * Pass false on a read-only table — a document you are *reading* has nothing
   * to type, so a toggle only hides the information you opened the screen for.
   * Every field then renders on the card, still grouped under the title.
   */
  collapse?: boolean;
};

const IDX_STYLE: CSSProperties = { color: "var(--faint)", fontSize: 11.5, textAlign: "center" };

/** Joins the classes a cell actually has; undefined when it has none. */
const cx = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).join(" ") || undefined;

const fill = (s: string, n: number | string) => s.split("{n}").join(String(n));

function Chevron() {
  return (
    <svg className="li-chev" width="12" height="12" viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

export default function LineItems<Row>({
  rows, fields, onRemove, showIndex, addLabel, onAdd, addWrap = "bar", rowClass, footer, footerCard,
  collapse = true,
}: LineItemsProps<Row>) {
  const phone = useIsPhone();
  /**
   * Which cards are expanded, keyed by row index.
   *
   * Index keys have to be remapped when a row is removed, or the open state
   * stays behind on an index that now holds a different line: remove line 2
   * with line 3 open and line 3 snaps shut while the *next* line added comes
   * up already expanded. Handled once here, so no screen can get it wrong.
   */
  const [open, setOpen] = useState<Record<number, boolean>>({});

  const removeAt = (i: number) => {
    setOpen((prev) => {
      const next: Record<number, boolean> = {};
      for (const k of Object.keys(prev)) {
        const n = Number(k);
        if (n < i) next[n] = prev[n];
        else if (n > i) next[n - 1] = prev[n];
      }
      return next;
    });
    onRemove?.(i);
  };

  const addButton = addLabel && onAdd
    ? (addWrap === "inline"
        ? <button type="button" className={`btn ghost sm${phone ? " li-add" : ""}`}
            style={phone ? undefined : { marginBlockStart: 8 }} onClick={onAdd}>{addLabel}</button>
        : <div className="addrow">
            <button type="button" className={`btn ghost sm${phone ? " li-add" : ""}`} onClick={onAdd}>{addLabel}</button>
          </div>)
    : null;

  /* ── Desktop: the table each screen had before ────────────────────── */
  if (!phone) {
    return (
      <>
        <div className="twrap">
          <table>
            <thead>
              <tr>
                {showIndex && <th style={{ width: 26 }}>#</th>}
                {fields.map((f) => (
                  <th key={f.key} className={cx(f.numeric && "n", f.thClass)} style={f.th}>
                    {f.thLabel ?? f.label}
                  </th>
                ))}
                {/* The remove column exists only where rows can be removed —
                    a read-only table (a credit note's lines, a payment's
                    outstanding invoices) must not grow an empty column. */}
                {onRemove && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={rowClass?.(row, i)}>
                  {showIndex && <td style={IDX_STYLE}>{i + 1}</td>}
                  {fields.map((f) => (
                    <td key={f.key} className={cx(f.numeric && "n", f.tdClass)} style={f.td}>
                      {(!f.when || f.when(row)) ? f.render(row, i) : null}
                    </td>
                  ))}
                  {onRemove && (
                    <td>
                      <button type="button" className="rm" aria-label={t("inv.remove")}
                        onClick={() => removeAt(i)}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {footer && <tfoot>{footer}</tfoot>}
          </table>
        </div>
        {addButton}
      </>
    );
  }

  /* ── Phone: one card per line ─────────────────────────────────────── */
  return (
    <>
      <div className="li-list">
        {rows.map((row, i) => {
          const visible = fields.filter((f) => !f.when || f.when(row));
          const title = visible.find((f) => f.slot === "title");
          const primary = visible.filter((f) => f.slot === "primary");
          const more = visible.filter((f) => f !== title && f.slot !== "primary");
          const isOpen = !!open[i];
          return (
            <div className={`li-card${rowClass?.(row, i) ? " " + rowClass(row, i) : ""}`} key={i}>
              <div className="li-head">
                <span className="li-n">{fill(t("li.lineN"), i + 1)}</span>
                {onRemove && (
                  <button type="button" className="li-rm"
                    aria-label={fill(t("li.removeLine"), i + 1)}
                    onClick={() => removeAt(i)}>✕</button>
                )}
              </div>

              {title && (
                <div className="li-f">
                  <label>{title.label}</label>
                  {title.render(row, i)}
                </div>
              )}

              {primary.length > 0 && (
                <div className="li-row" data-cols={Math.min(primary.length, 2)}>
                  {primary.map((f) => (
                    <div className={`li-f${f.numeric ? " li-num" : ""}${f.tdClass ? " " + f.tdClass : ""}`} key={f.key}>
                      <label>{f.label}</label>
                      {f.render(row, i)}
                    </div>
                  ))}
                </div>
              )}

              {more.length > 0 && (
                <>
                  {collapse && (
                    <button type="button" className="li-more" aria-expanded={isOpen}
                      onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                      {isOpen ? t("li.fewer") : t("li.more")}
                      <Chevron />
                    </button>
                  )}
                  {(!collapse || isOpen) && (
                    <div className="li-extra">
                      {more.map((f) => (
                        <div className={`li-f${f.numeric ? " li-num" : ""}${f.tdClass ? " " + f.tdClass : ""}`} key={f.key}>
                          <label>{f.label}</label>
                          {f.render(row, i)}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {(footerCard ?? footer) && <div className="li-foot">{footerCard ?? footer}</div>}
      {addButton}
    </>
  );
}
