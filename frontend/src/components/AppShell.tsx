import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import { getLang, setLang } from "../lib/i18n";
import { toggleTheme } from "../lib/theme";
import { t } from "../i18n/strings";

type NavItem = { to: string; key: string; icon: JSX.Element } | { section: string };

const ICON = (d: string) => (
  <svg className="ic" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />
);

const NAV: NavItem[] = [
  { to: "/", key: "nav.dashboard", icon: ICON('<path d="M2.5 7.5 9 2.5l6.5 5V16h-13z"/>') },
  { section: "nav.sales" },
  { to: "/customers", key: "nav.customers", icon: ICON('<circle cx="9" cy="6" r="2.8"/><path d="M3 16c0-3.3 2.8-5 6-5s6 1.7 6 5"/>') },
  { to: "/orders", key: "nav.salesOrders", icon: ICON('<path d="M3.5 2.5h11v13h-11z"/><path d="M6 6h6M6 9h6M6 12h3.5"/>') },
  { to: "/invoices", key: "nav.invoices", icon: ICON('<path d="M3.5 2.5h8l3 3v10h-11z"/><path d="M6 9h6M6 12h3.5"/>') },
  { to: "/payments", key: "nav.payments", icon: ICON('<path d="M2.5 5h13v8h-13z"/><path d="M2.5 8h13"/>') },
  { to: "/receivables", key: "nav.receivables", icon: ICON('<path d="M3 15V8.5M7.5 15V3.5M12 15V10M15.5 15h-13"/>') },
  { section: "nav.compliance" },
  { to: "/e-invoice-log", key: "nav.eInvoiceLog", icon: ICON('<path d="M9 2.5l5.5 2.2V10c0 3.3-2.4 5.7-5.5 6.5C5.9 15.7 3.5 13.3 3.5 10V4.7z"/><path d="M6.8 9 8.5 10.7 11.7 7.2"/>') },
  { to: "/tax-settings", key: "nav.taxSettings", icon: ICON('<circle cx="9" cy="9" r="2.2"/><path d="M9 1.8v2.2M9 14v2.2M16.2 9H14M4 9H1.8"/>') },
];

const RAIL_KEY = "taxmate-rail";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; }
  });
  const [, force] = useState(0);
  const { currentUser } = useFrappeAuth();
  const navigate = useNavigate();

  useEffect(() => {
    try { localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0"); } catch { /* ignore */ }
  }, [collapsed]);

  const initials = (currentUser ?? "?")
    .split(/[@._-]/)[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <nav className="rail">
        <div className="rbrand">
          <span className="mark">T</span>
          <span>TaxMate</span>
        </div>

        {NAV.map((n, i) =>
          "section" in n ? (
            <div className="rsec" key={`s${i}`}>{t(n.section)}</div>
          ) : (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-tip={t(n.key)}
              className={({ isActive }) => `rlink${isActive ? " on" : ""}`}
            >
              {n.icon}
              <span>{t(n.key)}</span>
            </NavLink>
          ),
        )}

        <div className="rfoot">
          <span className="av">{initials}</span>
          <span>
            <b>{currentUser ?? "—"}</b>
            {t("role.accountant")}
          </span>
        </div>
      </nav>

      <div className="main">
        <div className="topbar">
          <button className="iconbtn" onClick={() => setCollapsed((c) => !c)} aria-label={t("a11y.toggleMenu")}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" />
            </svg>
          </button>

          <div className="tsearch">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
              <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
            </svg>
            <input
              type="search"
              placeholder={t("search.placeholder")}
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim();
                if (e.key === "Enter" && v) navigate(`/orders?q=${encodeURIComponent(v)}`);
              }}
            />
          </div>

          <div className="tright">
            <button
              className="langbtn"
              onClick={() => { setLang(getLang() === "en" ? "ar" : "en"); force((n) => n + 1); }}
            >
              {getLang() === "en" ? "عربي" : "English"}
            </button>
            <button className="iconbtn bordered" onClick={toggleTheme} aria-label={t("a11y.toggleTheme")}>
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="9" cy="9" r="3.4" />
                <path d="M9 1.6v2M9 14.4v2M16.4 9h-2M3.6 9h-2M14.2 3.8l-1.4 1.4M5.2 12.8l-1.4 1.4M14.2 14.2l-1.4-1.4M5.2 5.2 3.8 3.8" />
              </svg>
            </button>
          </div>
        </div>

        <div className="page">{children}</div>
      </div>
    </div>
  );
}
