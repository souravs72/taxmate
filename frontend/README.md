# TaxMate frontend

React + TypeScript SPA served from the TaxMate Frappe app. Frappe owns
authentication, authorisation, validation and every server-side job. This
app is the view layer only.

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
    npm run build          # writes into ../taxmate/public/frontend and ../taxmate/www
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

## Known dependency on backend work

`src/lib/frappe.ts` references `taxmate.api.sales_order.fulfilment_summary`.
It does not exist yet. The list screen hides the two value tiles and the
delivered-vs-billed bars until it does, rather than inventing numbers. It
needs to return:

    {"committed": 0.0, "delivered_value": 0.0, "billed_value": 0.0,
     "unbilled_delivered": 0.0, "open_count": 0, "overdue_count": 0}

This is the only custom endpoint the Sales Order screens need. Everything
else is stock Frappe/ERPNext — see `claude/sales-order-api-verification.md`.

## Regenerating models

    npm run gen:models

Reads the DocType JSON from the ERPNext and TaxMate sources and rewrites
`src/types/`. Never hand-edit those files.
