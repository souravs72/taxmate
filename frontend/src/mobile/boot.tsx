/** Native entry — dynamic import from main.tsx when isNative(). */
import React from "react";
import type { Root } from "react-dom/client";

import { LangProvider } from "../lib/i18n";
import MobileRoot from "./MobileRoot";
import { apiFetch } from "./http";
import { normaliseWorkspace } from "./api";
import { isMobileTest } from "./platform";

export function boot(root: Root): void {
  document.documentElement.classList.add("tm-native");
  // Browser test harness only (?mobile-test=1): unit-level hooks for e2e checks.
  if (isMobileTest()) {
    (window as unknown as { __taxmateTest?: unknown }).__taxmateTest = { apiFetch, normaliseWorkspace };
  }
  root.render(
    <React.StrictMode>
      <LangProvider>
        <MobileRoot />
      </LangProvider>
    </React.StrictMode>,
  );
}
