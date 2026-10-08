import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { FrappeProvider } from "frappe-react-sdk";

import App from "./App";
import { getSiteName, getSocketPort } from "./lib/frappe";
import { applyDir } from "./lib/i18n";
import { applyTheme } from "./lib/theme";
import { isNative, MOBILE_BUILD } from "./mobile/platform";

import "./styles/tokens.css";
import "./styles/app.css";

applyDir();
applyTheme();

/**
 * No `url` prop: the app is served from the bench, so every request is
 * same-origin and the session cookie rides along automatically.
 *
 * `siteName` comes from the server via window.site_name — not hardcoded.
 * On a multi-site bench the wrong value here sends X-Frappe-Site-Name for
 * somebody else's site, so it has to come from the site itself.
 */
const root = ReactDOM.createRoot(document.getElementById("root")!);

// Native app (Capacitor) only: its own root with workspace URL + token auth.
// Always false in the web build (see src/mobile/platform.ts).
if (MOBILE_BUILD && isNative()) void import("./mobile/boot").then((m) => m.boot(root));
else root.render(
  <React.StrictMode>
    <FrappeProvider
      siteName={getSiteName()}
      socketPort={getSocketPort()}
      enableSocket={false}
      swrConfig={{
        revalidateOnFocus: false,
        shouldRetryOnError: false,
      }}
    >
      <BrowserRouter basename="/taxmate">
        <App />
      </BrowserRouter>
    </FrappeProvider>
  </React.StrictMode>,
);
