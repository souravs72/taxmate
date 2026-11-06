/**
 * ActionMenu — Desk-style Create / Menu dropdown for form pageheads.
 *
 * Mirrors frappe.ui.Page add_custom_button_group: one trigger, a list of
 * labelled actions. Use for make/create links (label "Create") and secondary
 * status actions (label "Menu") so PageHead does not grow a long button row.
 *
 * Callers: DetailActions (create/menu props), CustomerForm, SupplierForm,
 * LeadDetail, and other PageHead action clusters with make-links.
 */
import { useEffect, useId, useRef, useState } from "react";

import { t } from "../i18n/strings";

import "../styles/action-menu.css";

export type ActionItem = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Skip rendering this row. */
  hidden?: boolean;
};

export type ActionMenuProps = {
  label: string;
  items: ActionItem[];
  /** Extra class on the trigger (defaults to ghost). */
  className?: string;
};

export function ActionMenu({ label, items, className }: ActionMenuProps) {
  const visible = items.filter((item) => !item.hidden);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!visible.length) return null;

  return (
    <div className={`amenu${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={className ?? "btn ghost"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <span className="amenu-caret" aria-hidden="true" />
      </button>
      {open ? (
        <ul className="amenu-list" role="menu" id={menuId}>
          {visible.map((item) => (
            <li key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                className="amenu-item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Create group — same label Desk uses for custom_make_buttons. */
export function CreateMenu({ items, className }: Omit<ActionMenuProps, "label">) {
  return <ActionMenu label={t("mr.create")} items={items} className={className} />;
}

/** Menu group — secondary / status actions. */
export function MenuActions({ items, className }: Omit<ActionMenuProps, "label">) {
  return <ActionMenu label={t("m.menu")} items={items} className={className} />;
}
