import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { useLang } from "../lib/i18n";
import { toggleTheme } from "../lib/theme";
import { useSession } from "../lib/session";
import { canViewTeam } from "../lib/roles";
import { buildNav, groupedNav, groupForPath, FeatureFlags } from "../lib/nav";
import { t } from "../i18n/strings";
import GlobalSearch from "./GlobalSearch";
import UserMenu from "./UserMenu";
import { navIcon } from "./navIcons";

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
  function toggleCollapsed() {
    setCollapsed((c) => {
      if (!c) setOpen({});
      return !c;
    });
  }
  const { lang, set: setLocale } = useLang();
  const [open, setOpen] = useState(loadOpen);
  const location = useLocation();
  const session = useSession();
  const { data: flagData } = useFrappeGetCall<{ message: FeatureFlags }>(
    "taxmate.api.settings.get_feature_flags",
    {},
    "feature-flags",
    { revalidateOnFocus: false }
  );
  const flags: FeatureFlags = flagData?.message ?? {};
  const baseNav = buildNav(flags);
  const nav = canViewTeam(session)
    ? baseNav
    : baseNav.filter((n) => n.type === "section" ? n.key !== "nav.company" : n.to !== "/team");
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

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <a className="skip" href="#taxmate-main">{t("a11y.skip")}</a>
      <nav className="rail">
        <div className="rbrand">
          <span className="mark">T</span>
          <span>TaxMate</span>
        </div>
        <div className="rail-body">
        {top.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            data-tip={t(n.key)}
            className={({ isActive }) => `rlink${isActive ? " on" : ""}`}
          >
            <span className="ic">{navIcon(n.to)}</span>
            <span>{t(n.key)}</span>
          </NavLink>
        ))}

        {groups.map((g) => {
          const expanded = !collapsed && !!open[g.key];
          return (
            <div className="rgroup" key={g.key}>
              <button
                type="button"
                className="rsec"
                aria-expanded={expanded}
                onClick={() => setOpen((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
              >
                <span>{t(g.key)}</span>
                <svg className="chev" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
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
                  <span className="ic">{navIcon(n.to)}</span>
                  <span>{t(n.key)}</span>
                </NavLink>
              ))}
            </div>
          );
        })}

        </div>{/* rail-body */}
      </nav>

      <div className="main">
        <div className="topbar">
          <button type="button" className="iconbtn" onClick={toggleCollapsed} aria-label={t("a11y.toggleMenu")}>
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
<UserMenu />
          </div>
        </div>

        <div className="page" id="taxmate-main" tabIndex={-1} key={lang}>{children}</div>
      </div>
    </div>
  );
}
