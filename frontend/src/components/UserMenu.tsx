import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappeAuth } from "frappe-react-sdk";

import { useSession } from "../lib/session";
import { canManageCompany, isAppProvider, spaRoleOf } from "../lib/roles";
import { t } from "../i18n/strings";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const session = useSession();
  const { currentUser, logout } = useFrappeAuth();

  const provider = isAppProvider(session);
  const roleLabel = provider ? t("role.provider") : t(`role.${spaRoleOf(session)}`);
  const canSettings = canManageCompany(session);
  const displayName = session.full_name || currentUser || "—";

  const initials = displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

  // Close on outside click / escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setOpen(false);
    try {
      await logout();
    } finally {
      window.location.assign("/login?redirect-to=/taxmate");
    }
  }

  function go(path: string) {
    setOpen(false);
    nav(path);
  }

  return (
    <div className="umwrap" ref={wrapRef}>
      <button
        type="button"
        className="umavbtn"
        aria-label={displayName}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>

      {open && (
        <div className="umdrop" role="menu">
          <div className="umdrop-header" role="presentation">
            <span className="umdrop-name">{displayName}</span>
            <span className="umdrop-role">{roleLabel}</span>
          </div>

          {canSettings && (
            <button
              type="button"
              role="menuitem"
              className="umdrop-item"
              onClick={() => go("/company")}
            >
              <span className="umdrop-ic">
                <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="9" cy="9" r="2.5" />
                  <path d="M9 1.5v1.5M9 15v1.5M1.5 9H3M15 9h1.5M4.1 4.1l1.1 1.1M12.8 12.8l1.1 1.1M4.1 13.9l1.1-1.1M12.8 5.2l1.1-1.1" />
                </svg>
              </span>
              {t("user.companySettings")}
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="umdrop-item"
            onClick={() => go("/profile")}
          >
            <span className="umdrop-ic">
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="9" cy="6.5" r="3" />
                <path d="M2.5 16c0-3.6 2.9-5 6.5-5s6.5 1.4 6.5 5" />
              </svg>
            </span>
            {t("user.editProfile")}
          </button>

          <div className="umdrop-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="umdrop-item danger"
            onClick={() => void signOut()}
            disabled={signingOut}
          >
            <span className="umdrop-ic">
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M7 3H3.5A1.5 1.5 0 002 4.5v9A1.5 1.5 0 003.5 15H7M11.5 5.5L15 9l-3.5 3.5M15 9H7" />
              </svg>
            </span>
            {signingOut ? "…" : t("user.logOut")}
          </button>
        </div>
      )}
    </div>
  );
}
