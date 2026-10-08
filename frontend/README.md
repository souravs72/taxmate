# TaxMate frontend

React + TypeScript SPA served from the TaxMate Frappe app. Frappe owns
authentication, authorisation, validation and every server-side job. This
app is the view layer only.

## Monorepo layout (one app, three surfaces)

TaxMate is a **single git repo / Frappe app**. Web and phone share one React
tree; Capacitor wraps the same screens. Do not split into a separate mobile
repo or React Native app.

```
apps/taxmate/                    # Frappe app (this monorepo)
  taxmate/                       # Python: DocTypes, taxmate.api.*, hooks, tests
    api/mobile.py                # Phone sign-in (guest + device token)
    api/mobile_auth.py           # auth_hooks: Authorization TaxMate <token>
    taxmate/doctype/…            # Includes TaxMate Mobile Device
  frontend/                      # One Node package for web + phone
    src/                         # Shared SPA screens (frappe-react-sdk)
    src/mobile/                  # Capacitor shell only (PIN, token, workspace)
    android/  ios/               # Native projects (cap sync)
    package.json                 # build | build:mobile | cap:sync
  .github/workflows/mobile.yml   # Debug APK + iOS simulator compile
```

| Surface | Build | Auth | Router basename |
|---|---|---|---|
| Web (`/taxmate`) | `npm run build` → `taxmate/public/frontend` | Cookie + CSRF | `/taxmate` |
| Phone (Capacitor) | `npm run build:mobile` → `dist-mobile` | `Authorization: TaxMate …` | `/` |

`__TAXMATE_MOBILE__` is false in the web build, so native branches are dropped
from the bench bundle. Phone steps: [MOBILE.md](./MOBILE.md).

## Where it goes

    apps/taxmate/
      frontend/              <- this folder
      taxmate/
        public/frontend/     <- build output (JS/CSS), served at /assets/taxmate/frontend/
        www/taxmate.html     <- built index.html, Jinja-rendered
        www/taxmate.py       <- get_context(): csrf_token + site_name
        hooks.py             <- website_route_rules

Copy `bench/www/taxmate.py` to `taxmate/www/taxmate.py` and merge
`bench/hooks-additions.py` into `taxmate/hooks.py`.

## Build

    cd apps/taxmate/frontend
    npm install
    npm run build          # web → ../taxmate/public/frontend and ../taxmate/www
    npm run build:mobile   # phone → dist-mobile/ (then npx cap sync)
    bench build --app taxmate
    bench --site <site> clear-cache

Then open `https://<site>/taxmate`.

## Develop

    npm run dev            # proxies /api, /assets, /files to localhost:8000

Sign in to the bench at `http://localhost:8000` first so the session cookie
exists; the dev server proxies same-origin so the cookie and CSRF token work.

## Things that are deliberate

**JS and CSS live under `public/`, not `www/`.** Frappe's static serving
refuses `.js` and `.css` from `www/`
(`frappe/website/page_renderers/static_page.py:12-23`). Only the HTML goes to
`www/`, where Jinja renders it.

**The site name is never hardcoded.** `taxmate.py` puts `frappe.local.site`
into the page and `FrappeProvider` reads it from there. On a multi-site bench
a hardcoded value sends `X-Frappe-Site-Name` for the wrong site.

**No `url` prop on `FrappeProvider`.** Same-origin, so the session cookie
rides along and there is no CORS to configure.

**SWR, not TanStack Query.** `frappe-react-sdk` ships SWR internally. Adding a
second data layer would duplicate the cache.

**Chart colours are not the brand blue.** Paired with the cyan "Delivered",
the brand blue fails the colour-blind separation floor. See
`src/styles/tokens.css`.

**Status mapping is client-side.** ERPNext has nine Sales Order statuses; the
UI shows four. Desk keeps showing the ERPNext value, so mapping on the client
keeps both views on the same record. See `src/lib/status.ts`.

## Sales Order fulfilment

`taxmate.api.sales_order.fulfilment_summary` returns committed, delivered, billed,
and unbilled totals plus open/overdue counts. The list screen reads that method
instead of inventing numbers.

## Regenerating models

    npm run gen:models

Reads the DocType JSON from the ERPNext and TaxMate sources and rewrites
`src/types/`. Never hand-edit those files.
