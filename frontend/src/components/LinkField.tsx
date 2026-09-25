import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../lib/frappe";
import { t } from "../i18n/strings";

type Hit = { value: string; description?: string };

type MenuBox = { top?: number; bottom?: number; left: number; width: number; maxHeight: number };

function placeMenu(input: HTMLInputElement): MenuBox {
  const rect = input.getBoundingClientRect();
  const gap = 4;
  const below = window.innerHeight - rect.bottom - gap;
  const above = rect.top - gap;
  const openUp = below < 160 && above > below;
  const maxHeight = Math.max(96, Math.min(240, openUp ? above : below));
  return openUp
    ? { bottom: window.innerHeight - rect.top + gap, left: rect.left, width: rect.width, maxHeight }
    : { top: rect.bottom + gap, left: rect.left, width: rect.width, maxHeight };
}

/**
 * Link search via taxmate.api.resource.search_link (catalogued).
 * Do not list child tables or hit frappe.desk.search from the SPA.
 */
export default function LinkField({
  doctype,
  value,
  onChange,
  placeholder,
  disabled,
  filters,
}: {
  doctype: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  filters?: unknown;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [box, setBox] = useState<MenuBox | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useFrappePostCall<{ message: Hit[] }>(METHOD.searchLink);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(() => {
      search
        .call({ doctype, txt: q, page_length: 12, filters: filters ?? undefined })
        .then((r) => setHits(r?.message ?? []))
        .catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(handle);
    // search.call identity is unstable; q/open/doctype are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, doctype]);

  const showMenu = open && hits.length > 0;

  useLayoutEffect(() => {
    if (!showMenu || !inputRef.current) return;
    const update = () => {
      if (inputRef.current) setBox(placeMenu(inputRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showMenu, hits]);

  return (
    <div>
      <input
        ref={inputRef}
        className="ctl"
        disabled={disabled}
        value={open ? q : value}
        placeholder={placeholder ?? t("search.placeholder")}
        aria-label={placeholder ?? t("search.placeholder")}
        aria-expanded={showMenu}
        onFocus={() => { setQ(value); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        autoComplete="off"
      />
      {showMenu && box && createPortal(
        <ul
          className="linkhits"
          role="listbox"
          style={{ top: box.top, bottom: box.bottom, left: box.left, width: box.width, maxHeight: box.maxHeight }}
        >
          {hits.map((h) => (
            <li key={h.value}>
              <button
                type="button"
                className="linkhit"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onChange(h.value); setQ(h.value); setOpen(false); }}
              >
                <b>{h.value}</b>
                {h.description && h.description !== h.value && <span>{h.description}</span>}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
