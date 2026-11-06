/**
 * Show/hide list columns. Preference is local to this browser (not Desk List Settings).
 */
import { useEffect, useRef, useState } from "react";

import { t } from "../i18n/strings";
import type { ListColumn } from "../lib/listMeta";

type Props = {
  all: ListColumn[];
  visible: string[];
  locked: string[];
  onChange: (visible: string[]) => void;
};

export function ColumnPicker({ all, visible, locked, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const vis = new Set(visible);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (fieldname: string) => {
    if (locked.includes(fieldname)) return;
    const next = vis.has(fieldname)
      ? visible.filter((f) => f !== fieldname)
      : [...visible, fieldname];
    // Preserve DocType column order from `all`.
    const ordered = all.map((c) => c.fieldname).filter((f) => next.includes(f) || locked.includes(f));
    onChange(ordered);
  };

  return (
    <div className="col-picker" ref={root}>
      <button type="button" className="btn ghost" aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {t("list.columns")}
      </button>
      {open && (
        <div className="col-picker-menu" role="dialog" aria-label={t("list.columns")}>
          {all.map((c) => {
            const isLocked = locked.includes(c.fieldname);
            const checked = vis.has(c.fieldname) || isLocked;
            return (
              <label key={c.fieldname} className="col-picker-row">
                <input type="checkbox" checked={checked} disabled={isLocked}
                  onChange={() => toggle(c.fieldname)} />
                <span>{c.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
