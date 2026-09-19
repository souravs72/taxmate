import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { FrappeProvider } from "frappe-react-sdk";

import App from "./App";
import { getSiteName, getSocketPort } from "./lib/frappe";
import { applyDir } from "./lib/i18n";
import { applyTheme } from "./lib/theme";

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
ReactDOM.createRoot(document.getElementById("root")!).render(
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
