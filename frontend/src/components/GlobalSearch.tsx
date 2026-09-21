import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../lib/frappe";
import { t } from "../i18n/strings";

type Hit = {
  type: "page" | "list" | "document";
  doctype?: string;
  name?: string;
  title: string;
  description?: string;
  route: string;
};

type Group = { title: string; results: Hit[] };

type SearchResponse = { message?: { query?: string; groups?: Group[] } };

const DEBOUNCE_MS = 220;

export default function GlobalSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  const search = useFrappePostCall<SearchResponse>(METHOD.awesomeSearch);

  const flat = groups.flatMap((g) => g.results.map((r) => ({ ...r, group: g.title })));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setGroups([]);
      setActive(0);
      setOpen(false);
      return;
    }
    const handle = window.setTimeout(() => {
      void search
        .call({ text, limit: 20 })
        .then((res) => {
          const next = res?.message?.groups ?? (res as unknown as { groups?: Group[] })?.groups ?? [];
          setGroups(next);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {
          setGroups([]);
          setOpen(true);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // search.call identity churns; q is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function go(hit: Hit) {
    setOpen(false);
    // SPA-only: never leave /taxmate for Desk /app routes.
    const route = hit.route.startsWith("/") ? hit.route : `/${hit.route}`;
    if (route.startsWith("/app/") || route.startsWith("http")) return;
    navigate(route);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const text = q.trim();
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && text) {
      setOpen(true);
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!text || !flat.length) {
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(flat[active] ?? flat[0]);
    }
  }

  let flatIndex = 0;

  return (
    <div className={`tsearch${open ? " open" : ""}`} ref={wrapRef} role="search">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label={t("a11y.search")}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
        placeholder={t("search.placeholder")}
        value={q}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          if (!next.trim()) {
            setGroups([]);
            setActive(0);
            setOpen(false);
          }
        }}
        onFocus={() => q.trim() && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <kbd className="tsearch-kbd" aria-hidden>
        {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}
      </kbd>

      {open && (
        <div className="tsearch-menu" id={listId} role="listbox">
          {search.loading && !flat.length && (
            <div className="tsearch-empty">{t("search.loading")}</div>
          )}
          {search.error && (
            <div className="tsearch-empty">{t("search.error")}</div>
          )}
          {!search.loading && !search.error && q.trim() && !flat.length && (
            <div className="tsearch-empty">{t("search.empty")}</div>
          )}
          {groups.map((g) => (
            <div className="tsearch-group" key={g.title}>
              <div className="tsearch-gtitle">{g.title}</div>
              {g.results.map((hit) => {
                const idx = flatIndex++;
                const on = idx === active;
                return (
                  <button
                    type="button"
                    key={`${hit.type}-${hit.route}-${hit.name ?? hit.title}`}
                    id={`${listId}-${idx}`}
                    role="option"
                    aria-selected={on}
                    className={`tsearch-item${on ? " on" : ""}`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(hit)}
                  >
                    <span className="tsearch-title">{hit.title}</span>
                    <span className="tsearch-desc">
                      {hit.doctype ? `${hit.doctype} · ` : ""}
                      {hit.description || hit.route}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="tsearch-hint">{t("search.hint")}</div>
        </div>
      )}
    </div>
  );
}
