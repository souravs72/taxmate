import { useEffect, useState } from "react";
import { useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../lib/frappe";
import { t } from "../i18n/strings";

type Hit = { value: string; description?: string };

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

  return (
    <div style={{ position: "relative" }}>
      <input
        className="ctl"
        disabled={disabled}
        value={open ? q : value}
        placeholder={placeholder ?? t("search.placeholder")}
        aria-label={placeholder ?? t("search.placeholder")}
        onFocus={() => { setQ(value); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        autoComplete="off"
      />
      {open && hits.length > 0 && (
        <ul className="linkhits" role="listbox">
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
        </ul>
      )}
    </div>
  );
}
