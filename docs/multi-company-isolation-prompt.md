# TaxMate — Multi-Company Data Isolation: Architecture & Implementation Brief

This replaces the generic "how would Frappe multi-company work in theory" version of this
prompt. Everything in **Part 0** is already true of this codebase as of 2026-10-06 — verified
by reading the actual files, not assumed. Do not re-derive it; use it as the starting state and
spend your analysis on what's incomplete, inconsistent, or unsafe in it.

---

## Part 0 — Ground truth: what TaxMate already is

**This is not a Desk app for end users.** `taxmate/setup/desk_gate.py`
(`before_request = ["taxmate.setup.desk_gate.block_desk_for_non_admin"]`) 302-redirects every
`/desk`, `/app`, `/apps` request to `/taxmate` for anyone who isn't `Administrator`.
`get_website_user_home_page` sends every non-Administrator to `/taxmate` on login. The real
frontend is a bespoke React SPA (`frontend/`, `frappe-react-sdk` 1.17, ~80 screens under
`frontend/src/screens/`). "Keep the existing frontend architecture intact" means *this* SPA +
its one backend gateway — not Desk list views/reports/forms, which non-admin users never see.

**Four roles, not generic ERPNext roles.** `taxmate/setup/spa_roles.py` defines marker Roles
with `desk_access=0`: `owner` (= System Manager inside the SPA), `accountant`
("TaxMate Accountant"), `clerk` ("TaxMate Accounts User"), `viewer` ("TaxMate Auditor",
read-only). Per-role Custom DocPerm rows are generated programmatically by
`_ensure_books_perms()` / `_perm_values()` over a doctype catalog — this is the existing
**role-permission** layer. It has nothing to do with company scoping; don't conflate the two
when designing fixes.

**Row-level company isolation already exists, generically, and is wired correctly in
principle.** `hooks.py` registers both hooks on `"*"`:
```python
permission_query_conditions = {"*": "taxmate.uae.permissions.get_permission_query_conditions"}
has_permission = {"*": "taxmate.uae.permissions.has_permission"}
```
`taxmate/uae/permissions.py` derives a user's permitted companies **exclusively from standard
Frappe `User Permission` rows** (`doctype="User Permission", allow="Company"`) — this is the
textbook, non-reinvented Frappe mechanism, applied correctly: it skips Administrator and System
Manager, it skips doctypes with no `company` field, and it ANDs a `company in (...)` clause onto
every list query and every `has_permission` check (including `create`, since `doc.get("company")`
is checked regardless of `ptype`).

**All SPA reads/writes already funnel through one backend gateway: `taxmate/api/resource.py`.**
`get_list / get / get_count / group_by_count / insert / save / delete / bulk_delete / get_meta /
search_link` wrap `frappe.client.*` (themselves permission-aware) and every call is first
checked against `is_allowed_doctype()` / `catalog_doctypes()` — an explicit allowlist. The
frontend data layer (`frontend/src/lib/resource.ts`) enforces this too: its own comment says
*"Screens must not call /api/resource or Desk methods"* — everything goes through
`taxmate.api.resource.*`. **This means company scoping has exactly one server-side chokepoint
for ordinary CRUD already — it does not need to be built, only used correctly and completed.**

**The one actual security gap found: isolation fails open, not closed, today.** The product has
*no flow that ever creates a `User Permission` (Company) row for a user*. Search confirms
`User Permission` is referenced in only 5 files (`uae/permissions.py`, `search.py`,
`setup/workspaces.py`, `sales_order.py`, and a test) — none of them write one. `api/users.py`'s
`invite_user` only does:
```python
company = frappe.defaults.get_user_default("Company")
if company:
    frappe.defaults.set_user_default("Company", company, user.name)
```
`frappe.defaults.set_user_default` is a **convenience default**, not an access boundary.
Per `_user_companies()`'s own logic, a user with zero `User Permission` rows gets `companies =
None`, which both hooks treat as *"no extra restriction"* — i.e. **every user invited through
the product today can read and write every company's data**, because nothing ever narrows them.
The permission machinery is correct; what's missing is the thing that populates it. This is the
single highest-priority finding — treat "Scenario A: single-company user, locked to Company A"
as currently false for every user on this app.

**The "active company" used by dashboards/reports is a different, unrelated concept, and it is
NOT what `User Permission` restricts.** 53 call sites across 23 backend files —
`api/accountant_dashboard.py`, `api/owner_dashboard.py`, `api/accounts.py`, `api/sales_order.py`,
`api/stock.py`, `api/report_badges.py`, `api/dashboard.py`, `setup/charts.py`, `setup/home.py`,
and more — independently call `frappe.defaults.get_user_default("Company")` to decide which
company's numbers to compute. This is Frappe's single-valued "default" idiom, scoped per user,
with no plural/"permitted companies" concept anywhere. There is no company switcher, no list of
a user's companies, nothing resembling Scenario B (multi-company accountant) in the product
today. `taxmate/api/__init__.py:get_session` (RPC name `taxmate.api.get_session`, wired to
frontend `METHOD.getSession`) returns a single `company: string | null` sourced from that same
default — nothing else. `frontend/src/lib/session.tsx` is the **one** context provider the SPA
has for session-scoped state (`SessionContext` / `useSession()`); it is the obvious, minimal
place to add `permitted_companies: string[]` and an `active_company` setter — **no new state
library is needed or justified**, this file is already the right shape.

**Raw SQL bypasses both hooks and is a real leak surface, not a hypothetical.** 11 files call
`frappe.db.sql` directly: `uae_vat/utils/vat_201.py` (12 calls), `uae_corporate_tax/utils/
corporate_tax.py` (5), `uae_e_invoicing/report/uae_e_invoice_vat_201_reconciliation/
uae_e_invoice_vat_201_reconciliation.py` (3), `uae_vat/utils/special_regime_ledger.py` (3), and
one each in `uae/setup.py`, `uae_vat/setup/__init__.py`, `uae_vat/doctype/uae_bad_debt_relief/
uae_bad_debt_relief.py`, `uae_vat/doctype/uae_excise_filing_log/uae_excise_filing_log.py`,
`uae_vat/doctype/uae_vat_201_filing_log/uae_vat_201_filing_log.py`,
`uae_corporate_tax/doctype/uae_ct_filing_log/uae_ct_filing_log.py`,
`uae_e_invoicing/doctype/uae_incoming_invoice/uae_incoming_invoice.py`. Each is a VAT/CT/
e-invoicing calculation that takes a `company` parameter and is only as safe as the caller that
supplies it — `permission_query_conditions` never touches raw SQL. `taxmate/api/resource.py`
already has the right primitive for this — `assert_company_read(company)` (calls
`frappe.has_permission("Company", "read", company)`) — and it is already used in
`accountant_dashboard.py`. Audit every one of the 23 "default company" call sites and all 11
raw-SQL files against whether `assert_company_read` (or equivalent) actually gates them; do not
assume it does because it exists in one file.

**DocType company-field inventory — 37 custom DocTypes, 21 already have `company`, 16 don't, and
the 16 split into clean, legitimate categories (verify each, don't blanket-add the field):**
- Child tables (inherit isolation via parent row permission — Frappe doesn't evaluate
  `permission_query_conditions` on child tables directly, and `resource.py` already excludes
  tables from the catalog via `meta.istable`): `uae_ct_adjustment_row`,
  `uae_capital_goods_adjustment_row`, `uae_excise_line`, `uae_esr_activity_row`,
  `uae_ubo_owner`, `uae_ubo_change_log`.
- Single/global config doctypes (site-wide, correctly company-less):
  `taxmate_settings`, `uae_tax_settings`, `uae_compliance_settings`, `uae_excise_settings`.
  **Inconsistency to resolve, not assume away:** `uae_ct_settings` *does* carry `company` while
  these four don't — confirm whether Corporate Tax settings being per-company (CT has
  company-level elections/exemptions under UAE law) while VAT/Excise/Compliance settings are
  global is an intentional legal distinction or a gap.
- Reference/lookup data, not tenant data: `uae_licence_authority_rule` (generic UAE free-zone
  authority rules).
- **The deliberate cross-company construct: `UAE VAT Group` / `UAE VAT Group Member`.** Under
  UAE VAT law, related companies can register as a single Tax Group and file one consolidated
  VAT 201. `uae_vat_group` has no single `company` by design; each `uae_vat_group_member` row
  carries its own `company`. A simple "scope every screen to one active company" model actively
  breaks this feature. This needs an explicit exception path (see Part 3) — a user authorized
  for a VAT Group's representative member must be able to see the group's consolidated view
  without that being treated as a cross-company leak. Treat this as the hard case that proves
  whether your design is correct, not an edge case to defer.

---

## Objective

Design, and then implement in phases, true multi-company data isolation for TaxMate on top of
what Part 0 describes — reusing the existing `User Permission` + `permission_query_conditions`
+ `has_permission` + `taxmate.api.resource` chokepoint wherever possible, extending the existing
`SessionContext` for frontend state, and treating the frontend (the React SPA) as untrusted: the
backend must be the sole source of truth for which company's data a request can return, exactly
as it already is for the doctypes that have a `company` field and non-empty `User Permission`
rows — the job is to make that true for *every* user and *every* code path, including the ones
that currently bypass it (raw SQL, the 23 "default company" call sites, VAT Group).

Normal users (`clerk`, `viewer`, and `accountant` users with exactly one company) should be
hard-locked to their permitted company/companies with no way to widen that via frontend
manipulation. `accountant` users with more than one permitted company need a company switcher
that re-scopes every company-dependent screen, dashboard, and report. `owner` (System Manager)
is the only role that may see everything, and only because System Manager already does in
`_user_companies()` / `spa_roles_of()` — do not add a second, separate "admin bypasses company
checks" code path; there should be exactly one.

---

## What to produce

### 1. Security model, stated precisely for this codebase

Walk the real request flow — not the generic one — for a SPA request:

```
React screen (frontend/src/screens/**)
  → lib/resource.ts hook (useDocList / useDoc / useInsert / ...)
    → taxmate.api.resource.{get_list,get,insert,save,delete,...}  [THE chokepoint]
      → is_allowed_doctype() catalog check
      → frappe.client.* → frappe.get_list / frappe.get_doc / Document.insert/save
        → permission_query_conditions["*"]  (list reads)
        → has_permission["*"]               (doc reads/writes/creates)
          → taxmate.uae.permissions._user_companies(user)  ← reads User Permission rows
```
State exactly where a hostile actor who edits the SPA's network calls — a forged `filters`,
a spoofed `company` on an insert body, a direct POST to `/api/method/taxmate.api.resource.insert`
with someone else's company — is stopped, and confirm it already *is* stopped today for any
doctype with a populated `company` field and a correctly populated `User Permission` set,
versus where it is **not** stopped today (raw SQL paths; dashboards/reports driven by
`get_user_default("Company")` without an `assert_company_read` gate; anything calling
`frappe.get_all` instead of `frappe.get_list` — check whether any of the 11 raw-SQL files or
any `api/*.py` use `get_all`, which bypasses permission query conditions entirely).

### 2. Fix the fails-open gap (Part 0, "the one actual security gap")

Design how `User Permission` (Company) rows get created, specifically:
- On user invite (`api/users.py:invite_user`) and on role/company edit (presumably via
  `frontend/src/screens/team`) — what UI and API need to exist so an owner/accountant-admin
  assigns one or more companies to a user, and that assignment writes real `User Permission`
  rows (`frappe.permissions.add_user_permission`), not just a `frappe.defaults` default.
- What happens to the ~0 users who exist today with *no* `User Permission` rows when this ships
  — do they become "unrestricted" (current behavior, now explicit) or "no companies, see
  nothing" (safer, but would lock out every current user until backfilled)? Pick one, state the
  migration consequence, and design the backfill (Part 5).
- Whether `owner`/System Manager should ever get literal `User Permission` rows at all, or stay
  governed purely by the existing `"System Manager" in frappe.get_roles(user)` bypass already in
  `_user_companies()` — don't introduce a second admin-bypass mechanism.

### 3. Frontend: extend `SessionContext`, don't replace it

Design the extension to `Session` (`frontend/src/lib/session.tsx`) and `get_session`
(`taxmate/api/__init__.py`) to carry `permitted_companies: {name, currency, country}[]` and
`active_company: string`, plus the setter path (a whitelisted method, e.g.
`taxmate.api.set_active_company`, that validates the chosen company is in the caller's
`User Permission` set via `assert_company_read`-style check before accepting it — never trust a
value the SPA merely echoes back). Specify:
- Where `active_company` is persisted across reload (session-side default vs. a client-only
  hint) and what happens on hard refresh, on the user's permitted companies changing under them
  mid-session (revoked access), and on choosing a company they're no longer permitted for.
- How screens currently reading `useSession().company` migrate to `active_company` — grep
  `frontend/src/lib/session.tsx`'s consumers before assuming this is a one-line rename; the
  field is `company`, singular, today.
- The company selector's placement (single global control, likely in whatever shell component
  renders persistent chrome across `frontend/src/screens/**`), and whether changing it triggers
  SWR/`useFrappeGetCall` cache invalidation (the hooks in `lib/resource.ts` key their cache
  strings on `JSON.stringify(params)` / explicit `key` args — confirm whether `active_company`
  needs to be folded into those cache keys so switching companies doesn't show stale data from
  the previous one, rather than inventing a separate invalidation mechanism).
- Whether `active_company` belongs in the URL (so back/forward and refresh behave predictably)
  given routing is `website_route_rules` → a single `/taxmate/<path:app_path>` catch-all.

### 4. Backend: close the "default company" and raw-SQL gaps

For the 23 files currently calling `frappe.defaults.get_user_default("Company")`: design the
replacement — almost certainly "accept an explicit `company` argument from the new
`active_company`, validate it with `assert_company_read` (already exists in
`taxmate/api/resource.py`, promote it to a shared import if it isn't already imported
everywhere it's needed), and only fall back to the user's default when no explicit company is
given (e.g. background jobs)." List which of the 23 files are user-request-driven (must take the
validated active company) versus scheduler-driven (`scheduler_events` in `hooks.py` — these have
no "session," so they must loop over a company's own `User Permission`-independent scope, e.g.
"for every company, run X" — not a per-user company at all).

For the 11 raw-SQL files: for each, confirm the `company` value reaching the SQL string/params
was validated against the caller's permitted companies before the query ran, and confirm
parameterization (no f-string interpolation of `company` into SQL — check `%s` placeholders are
used throughout `uae_vat/utils/vat_201.py` and the others, since that's also a SQL-injection
question, not only a tenancy one).

### 5. The VAT Group exception, designed explicitly

Specify how a user permitted for a VAT Group's companies sees the group's consolidated VAT 201
(spanning all `uae_vat_group_member` rows) without that constituting a leak for a user who is
only permitted for *some* of the group's member companies. Decide: does VAT Group access require
`User Permission` on every member company, or does representative-company access imply group
access by design (and if so, where is that checked — a dedicated `has_permission` branch for
`UAE VAT Group` / `UAE VAT Group Member`, since the generic one in `uae/permissions.py` has no
`company` field to key off for the group doc itself)?

### 6. Migration & backfill

Given production data already exists with no `User Permission` rows: how do existing users get
backfilled (from their current `frappe.defaults` default company, from `Company` ownership, from
a one-time admin pass?) without a flag-day outage, and how do the 16 company-less DocTypes that
*should* arguably have been scoped (re-check the Part 0 inconsistency on `uae_ct_settings` vs.
its siblings) get reconciled without a destructive schema change.

### 7. Phased implementation plan

Phase 1 (backend): `User Permission` creation flow + team/invite UI hook; `active_company`
RPC + validation; `assert_company_read` applied to all 23 default-company call sites and all 11
raw-SQL files; VAT Group branch in `uae/permissions.py`.
Phase 2 (frontend): `SessionContext` extension; company selector component; cache-key/
invalidation wiring in `lib/resource.ts` consumers.
Phase 3 (security checklist): re-verify read/create/update/delete through
`taxmate.api.resource.*` for every catalog doctype with `company`; re-verify the 11 raw-SQL
files; re-verify `search_link`/autocomplete (it proxies to `frappe.desk.search.search_link` —
confirm that also respects `permission_query_conditions`); re-verify `scheduler_events` jobs
never leak company-crossing aggregates in notifications (`uae_compliance/notifications.py` etc.
send deadline reminders — per company or per user across companies?).
Phase 4 (tests): a matrix keyed to the real roles (`owner`, `accountant` single-company,
`accountant` multi-company, `clerk`, `viewer`) × real doctypes with `company` (Sales Invoice,
Purchase Invoice, the 21 UAE doctypes) × direct-API attempts (forged `company` filter on
`taxmate.api.resource.get_list`, forged `company` on `insert`, direct REST to
`/api/resource/Sales Invoice`, which bypasses `is_allowed_doctype` entirely since that check only
lives in `taxmate.api.resource` — confirm whether `/api/resource/*` is reachable at all for SPA
users given their Website User / no-desk-access status, and if it is, whether the generic hooks
alone are sufficient there since the catalog allowlist doesn't apply on that route).

---

## Final recommendation — answer directly, with reasoning tied to the file paths above, not in the abstract

A. Can this ship without a new frontend architecture? (Answer should be yes, and point at
   `session.tsx` + `lib/resource.ts` as exactly sufficient — justify or refute.)
B. Is "add `?company=` to API calls" sufficient? (Answer should be no — explain precisely why,
   referencing the fails-open `User Permission` gap, not a generic warning.)
C. What does Frappe already handle natively here, confirmed working, that must not be
   reinvented? (`permission_query_conditions`, `has_permission`, `User Permission`,
   `frappe.has_permission`, `Document.insert/save` checks.)
D. What must TaxMate build that Frappe doesn't give for free? (The company-assignment UI/flow
   that populates `User Permission`; `active_company` state and its validated setter; the VAT
   Group exception; closing the raw-SQL and default-company gaps.)
E. What's the minimum frontend change? (Extend one context, add one selector component, thread
   `active_company` into existing hook calls and cache keys — no new state library.)
F. What's the correct backend security posture going forward? (Every mutation/read path must
   either go through `taxmate.api.resource` with its existing hooks, or explicitly call
   `assert_company_read`/`has_permission` itself if it's a raw-SQL or scheduler path that the
   generic hooks can't reach.)
G. If you owned this codebase, what's the first PR? (Should almost certainly be: the
   `User Permission`-creation flow, because every other fix is cosmetic while that gap stands —
   state whether you agree and why.)

Be opinionated. Where TaxMate's current code already does the right thing, say so and say "keep
it" rather than proposing an alternative for its own sake.
