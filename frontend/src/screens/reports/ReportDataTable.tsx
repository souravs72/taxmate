/**
 * Frappe query-report style grid: bordered cells, sticky header, horizontal
 * + vertical scroll in one viewport (like frappe-datatable `.dt-scrollable`).
 * Callers: ReportRunner. User: reports UI like Frappe with horizontal slider.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ReportCol = { fieldname?: string; label?: string; fieldtype?: string };

type Props = {
  columns: ReportCol[];
  rows: Record<string, unknown>[];
  renderCell: (row: Record<string, unknown>, col: ReportCol, colIndex: number) => ReactNode;
  isMoney: (col: ReportCol) => boolean;
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
};

function colWidth(col: ReportCol, index: number): number {
  const ft = col.fieldtype || "";
  if (ft === "Currency" || ft === "Float") return 130;
  if (ft === "Int" || ft === "Percent") return 100;
  if (ft === "Date" || ft === "Datetime") return 120;
  if (ft === "Check") return 80;
  if (index === 0) return 220;
  return 160;
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
  rowClassName,
  isRowActive,
  rowLabel,
  onRowActivate,
  rowKey,
  regionLabel,
  empty,
  loading,
  loadingNode,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 2) {
        setEdge({ start: true, end: true });
        return;
      }
      const sl = el.scrollLeft;
      // Normalize physical scrollLeft for RTL (engines differ on sign).
      const atStart = Math.abs(sl) <= 2;
      const atEnd = Math.abs(sl) >= max - 2 || Math.abs(sl + max) <= 2;
      setEdge({ start: atStart, end: atEnd });
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro.disconnect();
    };
  }, [columns, rows.length, loading]);

  if (loading) return <div className="rpt-dt-msg">{loadingNode}</div>;
  if (!rows.length) return <div className="rpt-dt-msg">{empty}</div>;

  const minWidth = columns.reduce((n, c, i) => n + colWidth(c, i), 0);

  return (
    <div
      className={[
        "rpt-dt-shell",
        !edge.start ? "rpt-dt-fade-start" : "",
        !edge.end ? "rpt-dt-fade-end" : "",
      ].filter(Boolean).join(" ")}
    >
      <div className="rpt-dt" ref={scroller} role="region" aria-label={regionLabel}>
        <table className="rpt-dt-table" style={{ minWidth }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.fieldname || i}
                  className={isMoney(c) ? "n" : undefined}
                  style={{ width: colWidth(c, i), minWidth: colWidth(c, i) }}
                >
                  {c.label || c.fieldname}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cls = rowClassName?.(row) ?? "";
              const active = Boolean(onRowActivate && isRowActive?.(row));
              const label = active ? rowLabel?.(row) : undefined;
              const onKey = active
                ? (e: KeyboardEvent<HTMLTableRowElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowActivate?.(row);
                    }
                  }
                : undefined;
              return (
                <tr
                  key={rowKey?.(row, i) ?? defaultRowKey(row, i)}
                  className={cls || undefined}
                  role={active ? "button" : undefined}
                  aria-label={label}
                  tabIndex={active ? 0 : undefined}
                  onClick={active ? () => onRowActivate?.(row) : undefined}
                  onKeyDown={onKey}
                >
                  {columns.map((c, ci) => {
                    const indent = ci === 0 ? Number(row.indent) || 0 : 0;
                    const raw = row[c.fieldname || ""];
                    const zero = isMoney(c) && (raw === 0 || raw === "0");
                    return (
                      <td
                        key={c.fieldname || ci}
                        className={[
                          isMoney(c) ? "n" : "",
                          row.bold && isMoney(c) ? "tot" : "",
                          zero ? "rpt-zero" : "",
                          ci === 0 ? "rpt-tree" : "",
                        ].filter(Boolean).join(" ") || undefined}
                        style={indent ? { paddingInlineStart: 12 + indent * 16 } : undefined}
                      >
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
  );
}
