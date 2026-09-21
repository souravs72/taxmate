# TaxMate UAE books SPA — tasks

Plan: `tasks/plan.md`

## Phase 1 — Shell and dashboard

## Task 1: Group the rail by module

**Description:** Move sales screens under a Sales section, items under Masters, keep UAE Compliance, and put Dashboard on `/`. Do not add Purchase or Accounting links until those screens exist.

**Acceptance criteria:**
- [x] Sidebar groups: Dashboard, Sales, Masters, UAE Compliance
- [x] `/` renders the dashboard; `/sales` still works as the sales hub
- [x] No nav item points at a missing route

**Verification:**
- [ ] `npx tsc --noEmit` in `frontend/`
- [ ] Manual: each rail link opens a real page

**Dependencies:** None

**Files likely touched:**
- `frontend/src/lib/nav.ts`
- `frontend/src/components/AppShell.tsx`
- `frontend/src/App.tsx`

**Estimated scope:** S

## Task 2: Real dashboard from catalogued APIs

**Description:** Replace the `/` redirect with a dashboard that reads `get_home`, overdue invoice count, `fulfilment_summary`, VAT 201 list, failed e-invoice logs, and recent invoices. No invented revenue or charts.

**Acceptance criteria:**
- [x] KPI tiles map to `get_home` names or `get_count` filters that exist
- [x] Currency on fulfilment comes from the API / session, never a hardcoded AED
- [x] VAT 201 rows are not links until a VAT 201 screen ships
- [x] Panel errors do not blank the rest of the page
- [x] Loading counts show "—" not `0`

**Verification:**
- [ ] `npx tsc --noEmit` in `frontend/`
- [ ] Manual: dashboard loads for a logged-in accountant

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/screens/dashboard/Dashboard.tsx`
- `frontend/src/lib/frappe.ts`
- `frontend/src/styles/app.css`

**Estimated scope:** M

## Task 3: i18n and AwesomeBar pages for dashboard

**Description:** Add English/Arabic strings for the new nav groups and dashboard copy. Register Dashboard (and existing compliance pages) in SPA search pages.

**Acceptance criteria:**
- [x] `nav.masters` and dashboard keys exist in `en` and `ar`
- [x] Searching "dashboard" returns route `/`
- [x] Search still never returns `/app/` routes

**Verification:**
- [ ] `bench --site <site> run-tests --module taxmate.tests.test_search`
- [ ] `npx tsc --noEmit` in `frontend/`

**Dependencies:** Task 2

**Files likely touched:**
- `frontend/src/i18n/strings.ts`
- `taxmate/api/search.py`
- `taxmate/tests/test_search.py`

**Estimated scope:** S

## Checkpoint: After Phase 1

- [x] tsc clean
- [x] Search tests pass
- [x] Dashboard shows server numbers only
- [x] Rail groups match shipped screens
- [ ] Review before Phase 2

## Phase 2 — Finish sales

## Task 4: Delivery Note list (+ search routes)

**Description:** List Delivery Notes with catalog `get_list`; keep existing detail. Add SPA search list/doc routes.

**Acceptance criteria:**
- [x] `/delivery-notes` lists via `taxmate.api.resource.get_list`
- [x] Status filter uses ERPNext Delivery Note.status options
- [x] Search routes `/delivery-notes` and `/delivery-notes/{name}`; no `/app/`
- [x] Rail Sales group includes Delivery Notes

## Phase 3 — Purchase

## Task 5: Supplier list + form (clone Customer patterns)

- [x] `/suppliers` lists via `taxmate.api.resource.get_list`
- [x] New/edit form inserts Supplier then Address+Contact with `link_doctype: Supplier`
- [x] Default group from Buying Settings; legal/UAE fields match Customer
- [x] Search routes `/suppliers` and `/suppliers/{name}`; no `/app/`
- [x] Rail Purchase group includes Suppliers

## Task 6: Purchase Invoice list + detail + form (read/submit via catalog)

- [x] `/purchase-invoices` lists via `taxmate.api.resource.get_list` (company-scoped)
- [x] Detail uses `get` + nested items; payments via parent Payment Entry filters
- [x] Form insert then `taxmate.api.workflow.submit`; party/item details catalogued
- [x] Search routes `/purchase-invoices` and `/purchase-invoices/{name}`; no `/app/`
- [x] Rail Purchase group includes Purchase Invoices

## Task 7: Accounts Payable report screen (clone Receivables + `run_report`)

- [x] `/payables` runs catalog `Accounts Payable` via `run_report`
- [x] Paused until session company; Pay deep-link uses existing payment form
- [x] Search route `/payables`; rail under Purchase

## Task 8: Incoming e-invoice list and draft-PI action

- [x] `/incoming-invoices` lists via `taxmate.api.resource.get_list` (company-scoped)
- [x] Status tiles/charts from catalog `get_list` group-by; currency never invented
- [x] Detail drafts PI via catalog `create_purchase_invoice`; search routes `/incoming-invoices` and `/incoming-invoices/{name}`; no `/app/`
- [x] Rail Purchase group includes Incoming e-Invoices
- [x] Write-path API test for draft PI

## Task 9: Purchase Order / Purchase Receipt lists after PI works

- [x] `/purchase-orders` and `/purchase-receipts` list via catalog `get_list` (company-scoped)
- [x] Status tiles/charts from grouped `base_grand_total`; late PO count via `get_count`
- [x] Detail via parent `get` (nested items); search routes; no `/app/`
- [x] Rail Purchase group includes both lists

## Phase 4 — Accounting

## Task 10: Journal Entry list + detail + form

- [x] `/journals` lists via `taxmate.api.resource.get_list` (company-scoped)
- [x] Detail uses parent `get` + nested `accounts`; status from `docstatus`
- [x] Form insert then `taxmate.api.workflow.submit`; leaf Account link filters
- [x] Search routes `/journals` and `/journals/{name}`; no `/app/`
- [x] Rail Accounting group includes Journal Entries
- [x] Write-path API test for insert then submit

## Task 11: Chart of Accounts (Account list/tree from catalog)

- [x] `/accounts` expands via catalog `get_account_tree` (company, one level, lazy)
- [x] Detail via parent `get`; no invented balances
- [x] Search routes `/accounts` and `/accounts/{name}`; no `/app/`
- [x] Rail Accounting group includes Chart of Accounts

## Task 12: Report runner for TB / GL / P&amp;L / BS / Cash Flow using `list_reports` + `run_report` only with documented filters

- [x] `/reports` lists catalog core books reports via `list_reports`
- [x] `/reports/:report` runs `run_report` with a JSON object of documented filters
- [x] Search route `/reports`; no `/app/`
- [x] Rail Accounting group includes Reports
- [x] API test for P&amp;L object filters

## Phase 5 — Masters

## Task 13: Warehouse list; tax templates as read-only lists if forms are too heavy

- [x] `/warehouses` lists via catalog `get_list` (company-scoped)
- [x] Detail via parent `get`; no invented stock balances
- [x] `/tax-templates` lists Sales and Purchase tax templates (read-only, nested taxes from parent `get`)
- [x] Search routes; no `/app/`
- [x] Rail Masters group includes both lists

## Phase 6 — UAE compliance screens

## Task 14: VAT 201 list + detail (then wire dashboard rows to it)

- [x] `/vat-201` lists via catalog `get_list` (company-scoped)
- [x] Detail via parent `get` (boxes nested); charts from group_by, not invented totals
- [x] Prepare form calls catalog `get_or_create_vat_201`; regenerate via `generate_vat_201`
- [x] Dashboard overdue tile and filing rows link to `/vat-201`
- [x] Search routes `/vat-201` and `/vat-201/{name}`; no `/app/`
- [x] Rail UAE Compliance includes VAT 201
- [x] Write-path API test for get_or_create

## Task 15: CT filing, ESR, UBO, late filing — one DocType list at a time

- [x] `/ct-filings` list + detail via catalog `get_list` / parent `get`
- [x] `/esr` list + detail (activities nested on parent)
- [x] `/ubo` list + detail (owners nested on parent)
- [x] `/late-filings` list + detail
- [x] Charts from group_by; no invented totals; no child-table `get_list`
- [x] Search routes; no `/app/`
- [x] Rail UAE Compliance includes all four lists

## Task 16: UAE report pages through the same report runner

- [x] `/reports` lists catalog UAE reports next to core books via `list_reports`
- [x] `/reports/:report` runs `run_report` with a JSON object of documented filters
- [x] Search route `/reports`; no `/app/`
- [x] API test for UAE Late Filing Status object filters

## Phase 7 — Polish

## Task 17: Search routes for every shipped screen; empty/error copy; RTL pass

**Description:** Every rail link is an AwesomeBar page. Empty and error copy on lists. Arabic sets `dir=rtl` and re-renders the tree.

**Acceptance criteria:**
- [x] `_NAV_PAGES` routes match the sidebar; none start with `/app/`
- [x] Search never dumps empty Enter into a leftover `/orders` query
- [x] 404 home goes to `/`; e-invoice log has dedicated empty/error copy
- [x] Language switch updates `dir` and re-renders screens via React context
- [x] Layout uses logical CSS (`padding-inline`, `inset-inline`); collapsed rail tooltip flips in RTL

**Verification:**
- [x] `bench --site taxmate.site run-tests --module taxmate.tests.test_search`
- [x] `npx tsc --noEmit` in `frontend/`
- [x] Manual: عربي on a list flips `dir` and Arabic copy

**Dependencies:** Task 16

**Files likely touched:**
- `taxmate/api/search.py`
- `taxmate/tests/test_search.py`
- `frontend/src/lib/i18n.ts`
- `frontend/src/components/GlobalSearch.tsx`
- `frontend/src/screens/NotFound.tsx`

**Estimated scope:** S

## Phase 8 — Team access

## Task 18: Users and four SPA roles

**Description:** A UAE accounts firm should invite staff without Desk Role Manager. The SPA shows four roles — Owner, Accountant, Clerk, Viewer — each a bundle of Frappe roles. User stays off catalog `get_list`.

**Acceptance criteria:**
- [x] `get_session` returns `spa_role` (`owner` | `accountant` | `clerk` | `viewer`)
- [x] Catalog actions `list_users` / `invite_user` / `set_user_role` / `set_user_enabled`; User is still not an allowed resource doctype
- [x] Owner can invite, change role, and disable; Clerk and Viewer cannot
- [x] `/team` list + invite form; rail link; search route; no `/app/`
- [x] Viewer cannot submit; Clerk can submit but not cancel; Owner and Accountant can cancel
- [x] Write-path API test for invite then set role

**Verification:**
- [x] `bench --site taxmate.site run-tests --module taxmate.tests.test_spa_users`
- [x] `bench --site taxmate.site run-tests --module taxmate.tests.test_search`
- [x] `npx tsc --noEmit` in `frontend/`

**Dependencies:** Task 17

**Files likely touched:**
- `taxmate/setup/spa_roles.py`
- `taxmate/api/users.py`
- `taxmate/api/__init__.py`
- `frontend/src/screens/team/`
- `frontend/src/lib/roles.ts`

**Estimated scope:** M

## Phase 9 — Buy cycle

## Task 19: Purchase Order create and convert

**Description:** A UAE firm must raise a PO, then receive and bill it, without Desk. List already exists; this slice adds create/submit and catalogued mappers to Receipt and Purchase Invoice.

**Acceptance criteria:**
- [x] `/purchase-orders/new` form: supplier, dates, tax template, items; insert then `workflow.submit`
- [x] New button on the PO list (hidden for Viewer)
- [x] Submitted PO can map to draft Purchase Receipt and Purchase Invoice via catalog actions
- [x] Search still uses `/purchase-orders`; no `/app/`
- [x] Write-path API test: insert PO, submit, `make_purchase_receipt` returns unsaved PR

**Verification:**
- [x] `bench --site taxmate.site run-tests --module taxmate.tests.test_api`
- [x] `npx tsc --noEmit` in `frontend/`

**Dependencies:** Task 18

**Files likely touched:**
- `taxmate/api/purchase_order.py`
- `frontend/src/screens/purchase-order/`

**Estimated scope:** M

