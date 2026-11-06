/**
 * Query-report grid in the shape of Desk's frappe-datatable: row index,
 * sticky header, a filter input under each column, tree twist on parents,
 * one scrollport for both axes.
 * Callers: ReportRunner.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ReportCol = { fieldname?: string; label?: string; fieldtype?: string };

type Props = {
  columns: ReportCol[];
  rows: Record<string, unknown>[];
  renderCell: (row: Record<string, unknown>, col: ReportCol, colIndex: number) => ReactNode;
  isMoney: (col: ReportCol) => boolean;
  /** Phone: narrower money columns once currency symbols are off the cells. */
  compact?: boolean;
  rowClassName?: (row: Record<string, unknown>) => string;
  /** When true, row is keyboard/mouse activatable (do not infer from CSS). */
  isRowActive?: (row: Record<string, unknown>) => boolean;
  rowLabel?: (row: Record<string, unknown>) => string;
  onRowActivate?: (row: Record<string, unknown>) => void;
  rowKey?: (row: Record<string, unknown>, index: number) => string;
  regionLabel: string;
  empty: ReactNode;
  loading?: boolean;
  loadingNode?: ReactNode;
  /** Desk footer: comparison hint on the left. */
  footnote?: ReactNode;
  /** Right side of the footer. `shown` is after column filters. */
  countLabel: (shown: number, total: number) => string;
  filterLabel: (column: string) => string;
  rowNumberLabel: string;
  toggleLabel: (name: string) => string;
  noMatch: ReactNode;
};

function colWidth(col: ReportCol, index: number, compact?: boolean): number {
  const ft = col.fieldtype || "";
  if (compact) {
    if (ft === "Currency" || ft === "Float") return 118;
    if (ft === "Int" || ft === "Percent") return 72;
    if (ft === "Date" || ft === "Datetime") return 108;
    if (ft === "Check") return 64;
    if (index === 0) return 200;
    return 128;
  }
  if (ft === "Currency" || ft === "Float") return 148;
  if (ft === "Int" || ft === "Percent") return 100;
  if (ft === "Date" || ft === "Datetime") return 120;
  if (ft === "Check") return 80;
  if (index === 0) return 260;
  return 150;
}

function cellText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return "";
}

function asNumber(text: string): number | null {
  const negative = /-|−|\(/.test(text);
  const digits = text.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!digits) return null;
  const n = parseFloat(digits[0]);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Desk column filters: contains, >5 <10 =324, and 5:10 ranges. */
function matchesFilter(query: string, text: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const range = q.match(/^(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)$/);
  if (range) {
    const n = asNumber(text);
    if (n == null) return false;
    return n >= parseFloat(range[1]) && n <= parseFloat(range[2]);
  }
  const cmp = q.match(/^(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
  if (cmp) {
    const n = asNumber(text);
    if (n == null) return false;
    const v = parseFloat(cmp[2]);
    if (cmp[1] === ">") return n > v;
    if (cmp[1] === ">=") return n >= v;
    if (cmp[1] === "<") return n < v;
    if (cmp[1] === "<=") return n <= v;
    return n === v;
  }
  return text.toLowerCase().includes(q.toLowerCase());
}

function indentOf(row: Record<string, unknown>): number {
  const n = Number(row.indent);
  return Number.isFinite(n) ? n : 0;
}

function isParentRow(rows: Record<string, unknown>[], index: number): boolean {
  const next = rows[index + 1];
  if (!next) return false;
  return indentOf(next) > indentOf(rows[index]);
}

function defaultRowKey(row: Record<string, unknown>, index: number): string {
  const parts = [
    row.voucher_no, row.voucher_type, row.account, row.party,
    row.item_code, row.posting_date, row.idx, index,
  ];
  return parts.map((p) => (p == null ? "" : String(p))).join("|");
}

export default function ReportDataTable({
  columns,
  rows,
  renderCell,
  isMoney,
  compact,
  rowClassName,
  isRowActive,
  rowLabel,
  onRowActivate,
  rowKey,
  regionLabel,
  empty,
  loading,
  loadingNode,
  footnote,
  countLabel,
  filterLabel,
  rowNumberLabel,
  toggleLabel,
  noMatch,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const [filters, setFilters] = useState<string[]>([]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const colKey = columns.map((c) => c.fieldname || "").join("|");

  useEffect(() => {
    setFilters([]);
    setClosed(new Set());
  }, [colKey]);

  const texts = useMemo(
    () => rows.map((row) => columns.map((col, i) => cellText(renderCell(row, col, i)))),
    [rows, columns, renderCell],
  );

  const filtered = useMemo(() => {
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) =>
        columns.every((_, ci) => matchesFilter(filters[ci] || "", texts[index]?.[ci] || "")),
      );
  }, [rows, columns, filters, texts]);

  const shown = useMemo(() => {
    let hideAbove = Infinity;
    const out: { row: Record<string, unknown>; index: number; parent: boolean }[] = [];
    for (const item of filtered) {
      const indent = indentOf(item.row);
      if (indent > hideAbove) continue;
      hideAbove = Infinity;
      const parent = isParentRow(rows, item.index);
      const key = rowKey?.(item.row, item.index) ?? defaultRowKey(item.row, item.index);
      out.push({ ...item, parent });
      if (parent && closed.has(key)) hideAbove = indent;
    }
    return out;
  }, [filtered, rows, closed, rowKey]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) {
        setEdge({ start: true, end: true });
        return;
      }
      const sl = Math.abs(el.scrollLeft);
      setEdge({ start: sl <= 2, end: sl >= max - 2 });
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [columns, shown.length, loading, compact]);

  const footer = (
    <div className="rpt-footer">
      <span className="rpt-footer-note">{footnote}</span>
      <span className="rpt-footer-meta">{countLabel(shown.length, rows.length)}</span>
    </div>
  );

  if (loading) {
    return (
      <>
        <div className="rpt-dt-msg">{loadingNode}</div>
        {footer}
      </>
    );
  }
  if (!rows.length) {
    return (
      <>
        <div className="rpt-dt-msg">{empty}</div>
        {footer}
      </>
    );
  }

  const indexW = compact ? 36 : 44;
  const minWidth = indexW + columns.reduce((n, c, i) => n + colWidth(c, i, compact), 0);

  return (
    <>
      <div
        className={[
          "rpt-dt-shell",
          !edge.start ? "rpt-dt-fade-start" : "",
          !edge.end ? "rpt-dt-fade-end" : "",
        ].filter(Boolean).join(" ")}
      >
        <div className="rpt-dt" ref={scroller} role="region" aria-label={regionLabel} tabIndex={0}>
          <table className="rpt-dt-table" style={{ minWidth }}>
            <thead>
              <tr>
                <th className="idx" style={{ width: indexW, minWidth: indexW }} aria-label={rowNumberLabel} />
                {columns.map((c, i) => (
                  <th
                    key={c.fieldname || i}
                    className={isMoney(c) ? "n" : undefined}
                    style={{ width: colWidth(c, i, compact), minWidth: colWidth(c, i, compact) }}
                  >
                    {c.label || c.fieldname}
                  </th>
                ))}
              </tr>
              <tr className="rpt-filter-row">
                <th className="idx" style={{ width: indexW, minWidth: indexW }} />
                {columns.map((c, i) => (
                  <th key={c.fieldname || i}>
                    <input
                      className="rpt-colf"
                      value={filters[i] || ""}
                      aria-label={filterLabel(c.label || c.fieldname || String(i + 1))}
                      onChange={(e) => {
                        const next = filters.slice();
                        next[i] = e.target.value;
                        setFilters(next);
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td className="rpt-none" colSpan={columns.length + 1}>{noMatch}</td>
                </tr>
              ) : shown.map(({ row, index, parent }, viewIndex) => {
                const cls = rowClassName?.(row) ?? "";
                const active = Boolean(onRowActivate && isRowActive?.(row));
                const label = active ? rowLabel?.(row) : undefined;
                const key = rowKey?.(row, index) ?? defaultRowKey(row, index);
                const onKey = active
                  ? (e: KeyboardEvent<HTMLTableRowElement>) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowActivate?.(row);
                      }
                    }
                  : undefined;
                const name = String(row.account || row.section || row.account_label || "");
                return (
                  <tr
                    key={key}
                    className={[cls, parent ? "rpt-parent" : ""].filter(Boolean).join(" ") || undefined}
                    role={active ? "button" : undefined}
                    aria-label={label}
                    tabIndex={active ? 0 : undefined}
                    onClick={active ? () => onRowActivate?.(row) : undefined}
                    onKeyDown={onKey}
                  >
                    <td className="idx">{viewIndex + 1}</td>
                    {columns.map((c, ci) => {
                      const indent = ci === 0 ? indentOf(row) : 0;
                      return (
                        <td
                          key={c.fieldname || ci}
                          className={[
                            isMoney(c) ? "n" : "",
                            (row.bold || parent) && isMoney(c) ? "tot" : "",
                            ci === 0 ? "rpt-tree" : "",
                          ].filter(Boolean).join(" ") || undefined}
                          style={indent || (ci === 0 && parent) ? { paddingInlineStart: 8 + indent * (compact ? 14 : 18) } : undefined}
                        >
                          {ci === 0 && parent && (
                            <button
                              type="button"
                              className="rpt-twist"
                              aria-expanded={!closed.has(key)}
                              aria-label={toggleLabel(name)}
                              onClick={(e) => {
                                e.stopPropagation();
                                setClosed((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                            >
                              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                                <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                          {renderCell(row, c, ci)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {footer}
    </>
  );
}
