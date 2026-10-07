import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../lib/frappe";
import { allowedDashModes } from "../lib/roles";
import { useSession } from "../lib/session";
import { t } from "../i18n/strings";

type CompanyRow = {
  name: string;
  company_name?: string;
  abbr?: string;
  default_currency?: string;
  country?: string;
};

type Payload = { active: string | null; companies: CompanyRow[] };

/** Show a filter box once the list is longer than this. */
const SEARCH_AFTER = 7;

function abbrOf(row?: CompanyRow | null, fallback?: string | null): string {
  const src = row?.abbr || row?.company_name || row?.name || fallback || "";
  if (row?.abbr) return row.abbr.slice(0, 4).toUpperCase();
  return src
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Where to land after switching. A document page (/invoices/ACC-SINV-0001)
 * belongs to the old company, so go to its list instead. The dashboard keeps
 * its query string (?as=accountant&month=…).
 */
function landingFor(pathname: string, search: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return `/taxmate/${search}`;
  if (parts[0] === "catalogue" && parts.length > 1) return `/taxmate/catalogue/${parts[1]}`;
  return `/taxmate/${parts[0]}`;
}

/** The all-clients screen is a view. Leaving it opens that one company. */
function searchAfterLeavingClients(search: string): string {
  const params = new URLSearchParams(search);
  if (params.get("as") === "clients") params.set("as", "accountant");
  const q = params.toString();
  return q ? `?${q}` : "";
}

/**
 * Header company switcher. Every screen, list, report, search and new
 * document follows the company chosen here (the server scopes lists to it).
 * One-company users see the name only, with no dropdown.
 */
export default function CompanySwitcher() {
  const session = useSession();
  const location = useLocation();
  const { data } = useFrappeGetCall<{ message: Payload }>(
    METHOD.listMyCompanies,
    undefined,
    session.user ? `my-companies-${session.user}` : null,
  );
  const switcher = useFrappePostCall<{ message: { active: string } }>(METHOD.switchCompany);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const companies = data?.message?.companies ?? [];
  const activeName = session.company ?? data?.message?.active ?? null;
  const active = companies.find((c) => c.name === activeName) ?? null;
  const multi = companies.length > 1;
  /* All clients is a view in the URL, not a stored company. A fake company
     name would fail can_use_company and be dropped. The header names the view
     while it is open, so it does not keep showing one company's name. */
  const clientsAllowed = (allowedDashModes(session) ?? []).includes("clients");
  const allView = clientsAllowed && new URLSearchParams(location.search).get("as") === "clients";
  const label = allView
    ? t("company.allClientsN").replace("{n}", String(companies.length))
    : active?.company_name || activeName || "—";
  const mark = allView && companies.length > 0
    ? String(companies.length)
    : abbrOf(active, activeName);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return companies;
    return companies.filter((c) =>
      `${c.company_name ?? ""} ${c.name} ${c.abbr ?? ""}`.toLowerCase().includes(needle),
    );
  }, [companies, q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setError(null);
      return;
    }
    const first = listRef.current?.querySelector<HTMLElement>(
      companies.length > SEARCH_AFTER ? "input" : "[role='menuitemradio']",
    );
    first?.focus();
  }, [open, companies.length]);

  async function choose(name: string) {
    if (busy) return;
    if (name === activeName && !allView) {
      setOpen(false);
      return;
    }
    setBusy(name);
    setError(null);
    try {
      if (name !== activeName) await switcher.call({ company: name });
      // A full reload drops every cached list, dashboard and form default
      // that belonged to the previous company. The dashboard keeps its query
      // string, so leaving the all-clients view has to replace `as=clients`
      // or the reload lands on the same practice screen.
      const search = allView ? searchAfterLeavingClients(location.search) : location.search;
      window.location.assign(landingFor(location.pathname, search));
    } catch {
      setBusy(null);
      setError(t("company.switchFailed"));
    }
  }

  function goAllClients() {
    if (busy) return;
    setOpen(false);
    if (allView) return;
    /* A navigation, not a company switch: switch_company is never called, so
       no document screen can end up with "all clients" as its company. A full
       assign rather than a router push, to match choose() above — the clients
       dashboard then loads with nothing cached from a single company. */
    window.location.assign("/taxmate/?as=clients");
  }

  function onListKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement) return;
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>("[role='menuitemradio']") ?? [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (index + 1) % items.length
      : event.key === "ArrowUp" ? (index <= 0 ? items.length - 1 : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  }

  if (!activeName && !companies.length) return null;

  if (!multi) {
    return (
      <div className="coswitch single" title={label}>
        <span className="av" aria-hidden="true">{mark}</span>
        <span className="nm">{label}</span>
      </div>
    );
  }

  return (
    <div className="coswitch" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="cobtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? "company-menu" : undefined}
        aria-label={`${t("company.switch")}: ${label}`}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="av" aria-hidden="true">{mark}</span>
        <span className="nm">{label}</span>
        <svg className="chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 4.5 6 7.5l3-3" />
        </svg>
      </button>

      {open && (
        <div className="umdrop codrop" ref={listRef}>
          <div className="umdrop-header" role="presentation">
            <span className="umdrop-name">{t("company.switch")}</span>
            <span className="umdrop-role">{t("company.switchHint")}</span>
          </div>
          {companies.length > SEARCH_AFTER && (
            <input
              className="cofind"
              type="search"
              value={q}
              placeholder={t("company.find")}
              aria-label={t("company.find")}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  e.stopPropagation();
                  listRef.current?.querySelector<HTMLElement>("[role='menuitemradio']")?.focus();
                }
                if (e.key === "Enter" && shown.length === 1) void choose(shown[0]!.name);
              }}
            />
          )}
          <div
            id="company-menu"
            className="colist"
            role="menu"
            aria-label={t("company.switch")}
            onKeyDown={onListKey}
          >
            {/* First, above the clients themselves — it is the way back out of
                a single company, and the only affordance that returns you to
                the practice view. Filtered out by the search box like any
                other item would be, so it is rendered outside `shown`. */}
            {!q.trim() && clientsAllowed && companies.length > 1 && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={allView}
                className={`umdrop-item coitem coall${allView ? " on" : ""}`}
                disabled={busy !== null}
                onClick={goAllClients}
              >
                <span className="av" aria-hidden="true">{companies.length}</span>
                <span className="coname">
                  <span>{t("company.allClients")}</span>
                  <small>{t("company.allClientsHint")}</small>
                </span>
                {allView && (
                  <svg className="cotick" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="m3 7.5 2.5 2.5L11 4.5" />
                  </svg>
                )}
              </button>
            )}
            {shown.map((c) => {
              const on = !allView && c.name === activeName;
              return (
                <button
                  key={c.name}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  className={`umdrop-item coitem${on ? " on" : ""}`}
                  disabled={busy !== null}
                  onClick={() => void choose(c.name)}
                >
                  <span className="av" aria-hidden="true">{abbrOf(c)}</span>
                  <span className="coname">
                    <span>{c.company_name || c.name}</span>
                    {c.default_currency && <small>{c.default_currency}</small>}
                  </span>
                  {busy === c.name ? (
                    <span className="cotick">…</span>
                  ) : on ? (
                    <svg className="cotick" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="m3 7.5 2.5 2.5L11 4.5" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
            {shown.length === 0 && <div className="coempty">{t("company.none")}</div>}
          </div>
          {error && <div className="coerr" role="alert">{error}</div>}
        </div>
      )}
    </div>
  );
}
