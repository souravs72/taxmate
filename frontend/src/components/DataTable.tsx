/**
 * The list-screen table, in one place.
 *
 * Every list in the app was repeating the same four things: the
 * error / loading / empty ladder, the `.twrap` + `.clickable` markup, the
 * click-and-Enter row handler, and the "showing N of M" footer with its
 * pager. Five copies meant five chances for a row to stop being keyboard
 * reachable, or for an error to render as "nothing found".
 *
 * Columns are data, so a screen describes its table rather than building it.
 *
 * Below 760px the same columns render as cards instead. A phone showed two of
 * eight columns inside a sideways-scrolling box, which is not a list. A screen
 * can say what each column means with `role`; when it says nothing, the roles
 * are inferred (see `inferRoles`) so every existing caller gets usable cards
 * without being touched.
 */

import { useMemo } from "react";

import { t } from "../i18n/strings";
import { useIsPhone } from "../lib/useMedia";
import { Empty, ErrorBox, Loading } from "./ui";
import "../styles/list-mobile.css";

/**
 * What a column means on a phone, where there is room for one line of title,
 * one figure, a few meta bits and some pills — not eight columns.
 */
export type ColumnRole = "title" | "subtitle" | "meta" | "amount" | "status" | "hide";

export type Column<Row> = {
  /** Stable key, also used for React's list key on the header cell. */
  key: string;
  header?: React.ReactNode;
  /** `n` right-aligns and applies tabular numerals — see styles/app.css. */
  className?: string;
  headClassName?: string;
  width?: number;
  cell: (row: Row) => React.ReactNode;
  /** Card-mode hint. Optional: unset columns are inferred. */
  role?: ColumnRole;
};

export type Selection<Row> = {
  /** Rows the user has ticked. */
  picked: Set<string>;
  /** Which rows may be ticked at all; the rest render a disabled box. */
  selectable: (row: Row) => boolean;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  label?: string;
};

export type AsyncState = {
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
};

type TableProps<Row> = {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  /** Present makes rows clickable and keyboard-reachable. */
  onOpen?: (row: Row) => void;
  state?: AsyncState;
  emptyLabel: string;
  selection?: Selection<Row>;
  rowClassName?: (row: Row) => string | undefined;
};

export function DataTable<Row>(props: TableProps<Row>) {
  const { rows, columns, rowKey, onOpen, state, emptyLabel, selection, rowClassName } = props;
  const phone = useIsPhone();

  if (state?.error) return <ErrorBox error={state.error} onRetry={state.onRetry} />;
  if (state?.isLoading) return <Loading />;
  if (rows.length === 0) return <Empty label={emptyLabel} />;

  if (phone) return <CardList {...props} />;

  const selectableRows = selection ? rows.filter(selection.selectable) : [];
  const allPicked = !!selection
    && selectableRows.length > 0
    && selectableRows.every((r) => selection.picked.has(rowKey(r)));

  return (
    <div className="twrap">
      <table className={onOpen ? "clickable" : undefined}>
        <thead>
          <tr>
            {selection && (
              <th className="sel">
                <input type="checkbox" aria-label={selection.label ?? t("list.selectAll")}
                  checked={allPicked} disabled={selectableRows.length === 0}
                  onChange={(e) => selection.onToggleAll(e.target.checked)} />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={c.headClassName ?? c.className}
                  style={c.width ? { width: c.width } : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowKey(row);
            const open = onOpen ? () => onOpen(row) : undefined;
            const picked = selection?.picked.has(id);
            const cls = [rowClassName?.(row), picked ? "picked" : ""].filter(Boolean).join(" ");
            return (
              <tr key={id} className={cls || undefined}
                  tabIndex={open ? 0 : undefined}
                  onClick={open}
                  onKeyDown={open ? (e) => { if (e.key === "Enter") open(); } : undefined}>
                {selection && (
                  /* stopPropagation, or ticking a box also opens the row. */
                  <td className="sel" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={id}
                      disabled={!selection.selectable(row)}
                      checked={!!picked}
                      onChange={() => selection.onToggle(id)} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={c.className}>{c.cell(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Card mode ────────────────────────────────────────────────────────── */

/** `className="n"` (or `"n tot"`) is app.css's right-aligned numeric cell. */
function isNumericColumn(className?: string): boolean {
  return !!className && /(^|\s)n(\s|$)/.test(className);
}

/**
 * Does this cell render a status chip?
 *
 * Checked structurally rather than by component name, because a production
 * bundle renames functions: a `<Pill cls="p-paid">` is recognised by its
 * `cls` prop, a `<span className="echip e-accepted">` by its class. The walk
 * is shallow — a status chip is never buried deep in a cell.
 */
function looksLikeStatus(node: React.ReactNode, depth = 0): boolean {
  if (node == null || typeof node !== "object" || depth > 3) return false;
  if (Array.isArray(node)) return node.some((n) => looksLikeStatus(n as React.ReactNode, depth + 1));

  const el = node as React.ReactElement<Record<string, unknown>>;
  const props = el.props as Record<string, unknown> | undefined;
  if (!props) return false;

  const type: unknown = el.type;
  const named = typeof type === "function" ? (type as { displayName?: string; name?: string }) : null;
  const name = named ? (named.displayName ?? named.name ?? "") : "";
  if (/pill|chip|status|badge/i.test(name)) return true;

  const cls = typeof props.className === "string" ? props.className : "";
  if (/(^|\s)(pill|echip|dir|badge)(\s|$)/.test(cls)) return true;

  /* `<Pill cls="p-paid">` / e-invoice chips pass their tone as `cls`. */
  const tone = typeof props.cls === "string" ? props.cls : "";
  if (/^(p|e)-/.test(tone)) return true;

  return looksLikeStatus(props.children as React.ReactNode, depth + 1);
}

/**
 * Does this cell render nothing but a form control?
 *
 * EInvoiceLog's first column is a selection checkbox, and "first column →
 * title" made every card's headline an empty tick box with the document
 * number nowhere on it. A control is never a title, so it is skipped when
 * one is picked and falls through to meta, where it is still tappable.
 */
function looksLikeControl(node: React.ReactNode, depth = 0): boolean {
  if (node == null || typeof node !== "object" || depth > 2) return false;
  if (Array.isArray(node)) {
    const real = node.filter((n) => n != null && n !== false && n !== "");
    return real.length > 0 && real.every((n) => looksLikeControl(n as React.ReactNode, depth + 1));
  }
  const el = node as React.ReactElement<Record<string, unknown>>;
  const type: unknown = el.type;
  if (type === "input" || type === "select" || type === "textarea") return true;
  const props = el.props as Record<string, unknown> | undefined;
  if (!props) return false;
  /* A wrapper around one control counts too — a <label> or a <span> holding
     only the box is still not a headline. */
  if (type === "label" || type === "span" || type === "div") {
    return looksLikeControl(props.children as React.ReactNode, depth + 1);
  }
  return false;
}

function cellOf<Row>(column: Column<Row>, row: Row): React.ReactNode {
  try {
    return column.cell(row);
  } catch {
    return null;
  }
}

/**
 * Resolve a role for every column.
 *
 * Explicit roles always win, so a screen can refine one column and let the
 * rest be inferred. What is left is filled in, in this order:
 *
 *   title   the first unclaimed column — the document number, in practice
 *   amount  a numeric (`className` "n") column in the back half of the table;
 *           failing that, the last numeric column. Money sits at the end of
 *           a table, so "numeric and late" is the money column.
 *   status  every unclaimed column whose cell renders a pill or chip
 *   meta    the next two unclaimed columns, in their table order
 *   hide    everything else — it stays in the table, off the card
 */
function inferRoles<Row>(columns: Column<Row>[], sample: Row | undefined): Map<string, ColumnRole> {
  const roles = new Map<string, ColumnRole>();
  for (const c of columns) if (c.role) roles.set(c.key, c.role);
  const taken = (role: ColumnRole) => columns.some((c) => roles.get(c.key) === role);

  if (!taken("title")) {
    const free = columns.filter((c) => !roles.has(c.key));
    /* Skip a leading selection checkbox; fall back to it only if every
       column is one, which cannot happen in practice. */
    const first = (sample !== undefined
      ? free.find((c) => !looksLikeControl(cellOf(c, sample)))
      : undefined) ?? free[0];
    if (first) roles.set(first.key, "title");
  }

  if (!taken("amount")) {
    const numeric = columns.filter((c) => !roles.has(c.key) && isNumericColumn(c.className));
    const mid = Math.floor(columns.length / 2);
    const late = numeric.find((c) => columns.indexOf(c) >= mid);
    const amount = late ?? numeric[numeric.length - 1];
    if (amount) roles.set(amount.key, "amount");
  }

  /* No `!taken("status")` guard: a screen that names ONE status column must
     not switch the detection off for the others. PaymentList says
     `role:"status"` on its direction chip, and that used to send its
     Paid/Unpaid pill to the grey meta line. For a table with no explicit
     roles nothing has claimed "status" at this point either way. */
  if (sample !== undefined) {
    for (const c of columns) {
      if (roles.has(c.key)) continue;
      if (looksLikeStatus(cellOf(c, sample))) roles.set(c.key, "status");
    }
  }

  let metas = columns.filter((c) => roles.get(c.key) === "meta").length;
  for (const c of columns) {
    if (metas >= 2) break;
    if (roles.has(c.key)) continue;
    roles.set(c.key, "meta");
    metas += 1;
  }

  for (const c of columns) if (!roles.has(c.key)) roles.set(c.key, "hide");
  return roles;
}

function CardList<Row>({
  rows, columns, rowKey, onOpen, selection, rowClassName,
}: TableProps<Row>) {
  const sample = rows[0];
  const roles = useMemo(() => inferRoles(columns, sample), [columns, sample]);

  const pick = (role: ColumnRole) => columns.filter((c) => roles.get(c.key) === role);
  const title = pick("title")[0];
  const subtitle = pick("subtitle")[0];
  const meta = pick("meta").slice(0, 3);
  const amount = pick("amount")[0];
  const status = pick("status");

  const selectableRows = selection ? rows.filter(selection.selectable) : [];
  const allPicked = !!selection
    && selectableRows.length > 0
    && selectableRows.every((r) => selection.picked.has(rowKey(r)));

  return (
    <div className="lm-cards">
      {selection && (
        <label className="lm-all">
          <input type="checkbox" aria-label={selection.label ?? t("list.selectAll")}
            checked={allPicked} disabled={selectableRows.length === 0}
            onChange={(e) => selection.onToggleAll(e.target.checked)} />
          <span>{selection.label ?? t("list.selectAll")}</span>
        </label>
      )}

      {rows.map((row) => {
        const id = rowKey(row);
        const open = onOpen ? () => onOpen(row) : undefined;
        const picked = selection?.picked.has(id);
        const cls = ["lm-card", picked ? "lm-picked" : "", rowClassName?.(row) ?? ""]
          .filter(Boolean).join(" ");
        return (
          <div key={id} className={cls}
            role={open ? "button" : undefined}
            tabIndex={open ? 0 : undefined}
            onClick={open}
            onKeyDown={open ? (e) => {
              /* Space would otherwise scroll the list under the finger. */
              if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                open();
              }
            } : undefined}
          >
            {selection && (
              /* stopPropagation, or ticking a box also opens the row. */
              <span className="lm-pick"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={id}
                  disabled={!selection.selectable(row)}
                  checked={!!picked}
                  onChange={() => selection.onToggle(id)} />
              </span>
            )}

            <div className="lm-body">
              <div className="lm-head">
                <span className="lm-title">{title ? title.cell(row) : id}</span>
                {amount && <span className="lm-amt">{amount.cell(row)}</span>}
              </div>
              {subtitle && <div className="lm-sub">{subtitle.cell(row)}</div>}
              {meta.length > 0 && (
                <div className="lm-meta">
                  {meta.map((c) => <span className="lm-bit" key={c.key}>{c.cell(row)}</span>)}
                </div>
              )}
              {status.length > 0 && (
                <div className="lm-tags">
                  {status.map((c) => <span className="lm-tag" key={c.key}>{c.cell(row)}</span>)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Showing N of M" plus the pager.
 *
 * `note` carries whatever the screen wants to add — the currency, usually,
 * since a figure without its unit is the bug this app keeps almost shipping.
 */
export function ListFooter({
  shown, total, page, pageSize, onPage, note,
}: {
  shown: number; total: number; page: number; pageSize: number;
  onPage: (page: number) => void;
  note?: React.ReactNode;
}) {
  return (
    <div className="foot">
      <span>
        {t("list.showing")} {shown} {t("list.of")} {total}
        {note ? <> · {note}</> : null}
      </span>
      <div className="pager">
        <button disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={t("list.prev")}>‹</button>
        <button aria-current="true">{page + 1}</button>
        <button disabled={(page + 1) * pageSize >= total} onClick={() => onPage(page + 1)}
                aria-label={t("list.next")}>›</button>
      </div>
    </div>
  );
}
