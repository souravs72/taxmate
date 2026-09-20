# Implementation Plan: TaxMate UAE books SPA

## Overview

TaxMate already has a React SPA at `/taxmate` and a catalog API (`taxmate.api.get_catalog()`). The SPA today is sales-centric (customers, orders, invoices, payments, receivables, items) plus two thin UAE screens (e-invoice log, tax settings). This plan expands the SPA into a UAE accounting product: grouped modules, a real dashboard, then purchase, books, masters, and FTA compliance — **view layer only**. The server remains the source of truth; the SPA must not invent KPIs, charts, or DocTypes that the catalog does not expose.

Reference screenshots (Finoptimus) inform **information architecture** — grouped rail, KPI row, deadline queue, recent work — not branding, colour, or copy.

## Architecture Decisions

- **SPA is view-only.** Lists, forms, and reports call `taxmate.api.resource.*`, `taxmate.api.dashboard.get_home`, `taxmate.api.sales_order.fulfilment_summary`, `taxmate.api.reports.run_report`, and catalogued UAE actions. No Desk methods, no `/api/resource` child-table lists, no hardcoded AED.
- **Do not add backend methods unless a screen cannot render from existing catalog data.** Prefer composing `get_home` + `get_list` + `get_count` + `run_report`. If a later phase needs a genuine aggregate (e.g. P&amp;L totals), add a whitelist method with tests — do not compute books in the browser from unpaged lists.
- **Nav groups only link to shipped routes.** Empty Purchase / Accounting groups are worse than omitting them. Groups appear when the first real screen in that module ships.
- **Keep TaxMate tokens.** Inter + IBM Plex Sans Arabic, `--brand: #487fff`, existing tiles/pills/cards. Do not clone the reference dark rail or purple CTA system.
- **Vertical slices.** One screen (list → detail/form → search route) per increment. Existing sales screens stay working.
- **Desk `/app/` UAE work is untouched.** No `app_include_js` for the SPA bundle. UAE Tax Settings stays a Single DocType.

## What a UAE books frontend must have

Mapped to what TaxMate already catalogs (DocTypes / reports / actions). Screens that do not exist yet are later phases — not fake pages.

### Sales (partially shipped)

| Need | Catalog | SPA today | Phase |
|---|---|---|---|
| Customers | Customer, Address, Contact | List + form | shipped |
| Sales orders | Sales Order + mappers | List + create + detail | shipped |
| Delivery notes | Delivery Note + `make_delivery_note` | Detail only | 2 |
| Sales invoices / credit notes | Sales Invoice + `make_sales_return` + e-invoice actions | List + form + detail + return | shipped |
| Receipts against SI | Payment Entry (Receive) | List + form + detail | shipped |
| Aged receivables | Report: Accounts Receivable | Screen | shipped |
| Quotations | Quotation (search allowlist) | none | 2 (after DN) |
| Item selling prices | Item Price | none | 5 |

### Purchase (shipped)

| Need | Catalog | SPA today | Phase |
|---|---|---|---|
| Suppliers | Supplier | List + form | 3 shipped |
| Purchase invoices | Purchase Invoice | List + form + detail | 3 shipped |
| Payments (Pay) | Payment Entry | Shared payment screens + PI/AP Pay | 3 shipped |
| Aged payables | Report: Accounts Payable | Screen + ageing charts | 3 shipped |
| Incoming e-invoices → draft PI | UAE Incoming Invoice + `draft_purchase_invoice_from_incoming` | List + detail + draft | 3 shipped |
| Purchase orders / receipts | Purchase Order, Purchase Receipt | List + detail | 3 shipped |

### Accounting (Journal Entry shipped)

| Need | Catalog | Phase |
|---|---|---|
| Journal Entry | Journal Entry | 4 shipped |
| Chart of accounts | Account | 4 (tree or filtered list, not a fake tree) |
| Bank / modes | Bank Account, Mode of Payment | 4 |
| Trial Balance, GL, P&amp;L, Balance Sheet, Cash Flow | catalog reports via `run_report` | 4 |
| Customer / Supplier ledgers | catalog reports | 4 |
| Cost Center, Fiscal Year | masters | 4/5 |

### Masters (items only)

| Need | Catalog | Phase |
|---|---|---|
| Items | Item | shipped |
| Warehouses | Warehouse | 5 |
| Tax templates | Sales/Purchase/Item Tax Template, Tax Category | 5 |
| Groups / UOM / Brand | Item Group, Customer Group, Supplier Group, UOM, Brand | 5 |

### UAE compliance (thin)

| Need | Catalog | Phase |
|---|---|---|
| E-invoice transmission log | UAE E-Invoice Log | shipped (list) |
| ASP / tax connection | UAE Tax Settings (Single) | shipped (read) |
| VAT 201 filing | UAE VAT 201 Filing Log + `get_or_create_vat_201` + report UAE VAT 201 | 6 |
| Late filing | UAE Late Filing Notice + report | 6 |
| Import VAT / customs | UAE Customs Declaration + Import VAT report | 6 |
| VAT group / bad debt | UAE VAT Group, UAE Bad Debt Relief | 6 |
| Corporate tax | UAE CT Settings, UAE CT Filing Log, worksheet report, `get_ct_elections` | 6 |
| UBO / ESR | UAE UBO Register, UAE ESR Filing | 6 |
| Related party / FTA pack | UAE Related Party, UAE FTA Audit Pack | 6 |
| E-invoice contingency | UAE E-Invoice Contingency | 6 |
| UAE reports | Late Filing Status, Group VAT, E-Invoice Status, VAT 201 Reconciliation, EmaraTax Export, Compliance Status | 6 (report runner) |

### Dashboard (this slice)

Must show **only** numbers the server already computes:

- `get_home` number cards: Draft Sales Invoices, Failed E-Invoices, Overdue VAT 201, Draft VAT 201
- `get_count` Sales Invoice `status = Overdue`
- `fulfilment_summary` open-order committed / delivered / billed
- `get_list` VAT 201 filings (`filing_due_date`, `deadline_status`, `status`, `net_vat_due`)
- `get_list` failed/rejected e-invoice logs
- `get_list` recent sales invoices

**Out of scope for dashboard:** invented Revenue YTD, P&amp;L sparkline, AI insights, fake task lists, currency defaulting to AED.

## Visual direction (TaxMate, not the reference)

- Light (and existing dark-scheme) rail using current tokens; sticky topbar + GlobalSearch stay.
- Dashboard hero is the **queue**, not a decorative chart: KPI tiles already in `app.css`, then a two-column board (FTA deadlines | open orders + recent invoices).
- Document names stay IBM Plex Mono. Deadlines use existing pills (`p-overdue`, `p-warn`, `p-open`, `p-done`).
- Grouped sidebar: Dashboard, Sales, Masters, UAE Compliance. Purchase / Accounting / Reports sections are added when those routes exist.

## Task List

See `tasks/todo.md`. Phase 1 is Tasks 1–3 (nav + dashboard + search/i18n). Stop after Phase 1 checkpoint unless continuing the next screen.

## Risks

- VAT 201 / e-invoice list calls fail if the user cannot read those DocTypes — isolate errors per panel.
- `useDocCount` returns `0` while loading; dashboard must show "—" until the call resolves.
- Payment list is Receive-only; do not put it under Purchase until Pay is a real filter.
- `run_report` for P&amp;L/BS needs ERPNext filter shapes (period, accumulated values). Do not guess filters on the dashboard.

## Out of scope

- Changing `common_site_config.json`, Desk workspaces, or CT/e-invoicing Python except catalog/search routes needed by a screen.
- Committing / pushing unless asked.
- Building every module in one pass.
