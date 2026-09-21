import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import { useLang } from "../lib/i18n";
import { toggleTheme } from "../lib/theme";
import { useSession } from "../lib/session";
import { canViewTeam, spaRoleOf } from "../lib/roles";
import { NAV, groupedNav, groupForPath } from "../lib/nav";
import { t } from "../i18n/strings";
import GlobalSearch from "./GlobalSearch";

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg className="ic" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const ICONS: Record<string, JSX.Element> = {
  "/": <Icon><path d="M2.5 7.5 9 2.5l6.5 5V16h-13z" /></Icon>,
  "/customers": <Icon><circle cx="9" cy="6" r="2.8" /><path d="M3 16c0-3.3 2.8-5 6-5s6 1.7 6 5" /></Icon>,
  "/orders": <Icon><path d="M3.5 2.5h11v13h-11z" /><path d="M6 6h6M6 9h6M6 12h3.5" /></Icon>,
  "/delivery-notes": <Icon><path d="M2 6h8v6H2zM10 8h2.5L15.5 10.5v1.5H10z" /><circle cx="4.5" cy="13.5" r="1.3" /><circle cx="13" cy="13.5" r="1.3" /></Icon>,
  "/invoices": <Icon><path d="M3.5 2.5h8l3 3v10h-11z" /><path d="M6 9h6M6 12h3.5" /></Icon>,
  "/payments": <Icon><path d="M2.5 5h13v8h-13z" /><path d="M2.5 8h13" /></Icon>,
  "/receivables": <Icon><path d="M3 15V8.5M7.5 15V3.5M12 15V10M15.5 15h-13" /></Icon>,
  "/suppliers": <Icon><path d="M4 15.5V8l5-3 5 3v7.5"/><path d="M4 8l5 3 5-3M9 11v4.5" /></Icon>,
  "/purchase-orders": <Icon><path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6M6 12h3.5"/></Icon>,
  "/purchase-receipts": <Icon><path d="M2 6h8v6H2zM10 8h2.5L15.5 10.5v1.5H10z"/><circle cx="4.5" cy="13.5" r="1.3"/><circle cx="13" cy="13.5" r="1.3"/></Icon>,
  "/incoming-invoices": <Icon><path d="M3 4.5h12v11H3z"/><path d="M6 2.5v4M12 2.5v4M6 9h6"/></Icon>,
  "/purchase-invoices": <Icon><path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h4"/></Icon>,
  "/payables": <Icon><path d="M3 15V8.5M7.5 15V3.5M12 15V10M15.5 15h-13"/></Icon>,
  "/journals": <Icon><path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h4.5M6 12h6"/></Icon>,
  "/accounts": <Icon><path d="M3 15.5V8l6-4 6 4v7.5"/><path d="M3 8l6 4 6-4"/></Icon>,
  "/reports": <Icon><path d="M3 15V8.5M7.5 15V3.5M12 15V10M15.5 15h-13"/></Icon>,
  "/catalogue/items": <Icon><path d="M3 4.5h12v9H3z" /><path d="M6 8h6" /></Icon>,
  "/warehouses": <Icon><path d="M3 14.5V6l6-3.5 6 3.5v8.5"/><path d="M3 6l6 3.5L15 6"/></Icon>,
  "/tax-templates": <Icon><path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6"/></Icon>,
  "/vat-201": <Icon><path d="M3.5 3.5h11v11h-11z"/><path d="M3.5 7h11M7 3.5V7"/></Icon>,
  "/ct-filings": <Icon><path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h4"/></Icon>,
  "/esr": <Icon><path d="M3 15.5V8l6-4 6 4v7.5"/><path d="M3 8l6 4 6-4"/></Icon>,
  "/ubo": <Icon><circle cx="9" cy="6" r="2.8"/><path d="M3 16c0-3.3 2.8-5 6-5s6 1.7 6 5"/></Icon>,
  "/late-filings": <Icon><path d="M9 2.5 16 15H2z"/><path d="M9 7v3.5M9 12.2v.6"/></Icon>,
  "/e-invoice-log": <Icon><path d="M9 2.5l5.5 2.2V10c0 3.3-2.4 5.7-5.5 6.5C5.9 15.7 3.5 13.3 3.5 10V4.7z" /><path d="M6.8 9 8.5 10.7 11.7 7.2" /></Icon>,
  "/tax-settings": <Icon><circle cx="9" cy="9" r="2.2" /><path d="M9 1.8v2.2M9 14v2.2M16.2 9H14M4 9H1.8" /></Icon>,
  "/team": <Icon><circle cx="6" cy="6.5" r="2.2" /><circle cx="12" cy="6.5" r="2.2" /><path d="M2 16c0-2.4 1.8-4 4-4s4 1.6 4 4M10 16c0-2.4 1.8-4 4-4s4 1.6 4 4" /></Icon>,
};

const RAIL_KEY = "taxmate-rail";
const OPEN_KEY = "taxmate-nav-open";

function loadOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; }
  });
  const { lang, set: setLocale } = useLang();
  const { currentUser, logout } = useFrappeAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [open, setOpen] = useState(loadOpen);
  const location = useLocation();
  const session = useSession();
  const roleLabel = t(`role.${spaRoleOf(session)}`);
  const nav = canViewTeam(session)
    ? NAV
    : NAV.filter((n) => n.type === "section" ? n.key !== "nav.company" : n.to !== "/team");
  const { top, groups } = useMemo(() => groupedNav(nav), [nav]);
  const activeGroup = groupForPath(groups, location.pathname);

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    if (!activeGroup) return;
    setOpen((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
  }, [activeGroup]);

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* ignore */ }
  }, [open]);

  const initials = (currentUser ?? "?")
    .split(/[@._-]/)[0]
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      window.location.assign("/login?redirect-to=/taxmate");
    }
  }

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <nav className="rail">
        <div className="rbrand">
          <span className="mark">T</span>
          <span>TaxMate</span>
        </div>

        {top.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            data-tip={t(n.key)}
            className={({ isActive }) => `rlink${isActive ? " on" : ""}`}
          >
            {ICONS[n.to]}
            <span>{t(n.key)}</span>
          </NavLink>
        ))}

        {groups.map((g) => {
          const expanded = collapsed || !!open[g.key];
          return (
            <div className="rgroup" key={g.key}>
              <button
                type="button"
                className="rsec"
                aria-expanded={expanded}
                onClick={() => setOpen((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
              >
                <span>{t(g.key)}</span>
                <svg className="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M4 2.5 8.5 6 4 9.5" />
                </svg>
              </button>
              {expanded && g.links.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  data-tip={t(n.key)}
                  className={({ isActive }) => `rlink${isActive ? " on" : ""}`}
                >
                  {ICONS[n.to]}
                  <span>{t(n.key)}</span>
                </NavLink>
              ))}
            </div>
          );
        })}

        <NavLink to="/profile" className={({ isActive }) => `rfoot${isActive ? " on" : ""}`} data-tip={t("nav.profile")}>
          <span className="av">{initials}</span>
          <span>
            <b>{session.full_name || currentUser || "—"}</b>
            {roleLabel}
          </span>
        </NavLink>
      </nav>

      <div className="main">
        <div className="topbar">
          <button type="button" className="iconbtn" onClick={() => setCollapsed((c) => !c)} aria-label={t("a11y.toggleMenu")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" />
            </svg>
          </button>

          <GlobalSearch />

          <div className="tright">
            <button
              type="button"
              className="langbtn"
              onClick={() => setLocale(lang === "en" ? "ar" : "en")}
            >
              {lang === "en" ? "عربي" : "English"}
            </button>
            <button type="button" className="iconbtn bordered" onClick={toggleTheme} aria-label={t("a11y.toggleTheme")}>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="9" cy="9" r="3.4" />
                <path d="M9 1.6v2M9 14.4v2M16.4 9h-2M3.6 9h-2M14.2 3.8l-1.4 1.4M5.2 12.8l-1.4 1.4M14.2 14.2l-1.4-1.4M5.2 5.2 3.8 3.8" />
              </svg>
            </button>
            <button
              type="button"
              className="langbtn"
              onClick={() => void signOut()}
              disabled={signingOut}
              aria-label={t("a11y.logout")}
            >
              {t("common.logout")}
            </button>
          </div>
        </div>

        <div className="page" key={lang}>{children}</div>
      </div>
    </div>
  );
}
