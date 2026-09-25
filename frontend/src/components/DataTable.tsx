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
 */

import { t } from "../i18n/strings";
import { Empty, ErrorBox, Loading } from "./ui";

export type Column<Row> = {
  /** Stable key, also used for React's list key on the header cell. */
  key: string;
  header?: React.ReactNode;
  /** `n` right-aligns and applies tabular numerals — see styles/app.css. */
  className?: string;
  headClassName?: string;
  width?: number;
  cell: (row: Row) => React.ReactNode;
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

export function DataTable<Row>({
  rows, columns, rowKey, onOpen, state, emptyLabel, selection, rowClassName,
}: {
  rows: Row[];
  columns: Column<Row>[];
  rowKey: (row: Row) => string;
  /** Present makes rows clickable and keyboard-reachable. */
  onOpen?: (row: Row) => void;
  state?: AsyncState;
  emptyLabel: string;
  selection?: Selection<Row>;
  rowClassName?: (row: Row) => string | undefined;
}) {
  if (state?.error) return <ErrorBox error={state.error} onRetry={state.onRetry} />;
  if (state?.isLoading) return <Loading />;
  if (rows.length === 0) return <Empty label={emptyLabel} />;

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
