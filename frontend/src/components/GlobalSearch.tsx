/**
 * AwesomeBar-style search for the TaxMate SPA shell.
 * Callers: AppShell topbar. Hits taxmate.api.search.awesome (METHOD.awesomeSearch).
 * Schema: { groups:[{ title, results:[{ type, route, title, … }] }] }.
 * User: "SEARCH ANYTHING BAR … should work like the awesomebar" + SPA-only routes;
 * follow-up from React review: race-safe debounce, no stale Enter, URL q on /orders, a11y name.
 */
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
  const reqId = useRef(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [groups, setGroups] = useState<Group[]>([]);
  /** Query string that `groups` belong to — blocks Enter on stale hits. */
  const [resultQuery, setResultQuery] = useState("");
  const [pending, setPending] = useState(false);
  const search = useFrappePostCall<SearchResponse>(METHOD.awesomeSearch);

  const text = q.trim();
  const resultsFresh = resultQuery === text;
  const flat = resultsFresh
    ? groups.flatMap((g) => g.results.map((r) => ({ ...r, group: g.title })))
    : [];

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
    const next = q.trim();
    // Invalidate immediately so Enter / UI never act on a prior query's hits.
    setGroups([]);
    setResultQuery("");
    setActive(0);

    if (!next) {
      setPending(false);
      return;
    }

    setPending(true);
    const id = ++reqId.current;
    const handle = window.setTimeout(() => {
      void search
        .call({ text: next, limit: 20 })
        .then((res) => {
          if (id !== reqId.current) return;
          const payload = res?.message ?? (res as unknown as { groups?: Group[] });
          const nextGroups = payload?.groups ?? [];
          setGroups(nextGroups);
          setResultQuery(next);
          setActive(0);
          setOpen(true);
          setPending(false);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setGroups([]);
          setResultQuery(next);
          setPending(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
      // Bump so any in-flight call for this effect is ignored.
      if (reqId.current === id) reqId.current += 1;
    };
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
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && text) {
      setOpen(true);
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (pending || !text) return;
      if (flat.length) {
        go(flat[active] ?? flat[0]);
        return;
      }
      if (resultsFresh) {
        navigate(`/orders?q=${encodeURIComponent(text)}`);
        setOpen(false);
      }
      return;
    }
    if (!flat.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
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
        aria-label={t("search.placeholder")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={flat[active] ? `${listId}-${active}` : undefined}
        placeholder={t("search.placeholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => text && setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      <kbd className="tsearch-kbd" aria-hidden>
        {typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}
      </kbd>

      {open && (
        <div className="tsearch-menu" id={listId} role="listbox">
          {pending && !flat.length && (
            <div className="tsearch-empty">{t("search.loading")}</div>
          )}
          {!pending && text && resultsFresh && !flat.length && (
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
