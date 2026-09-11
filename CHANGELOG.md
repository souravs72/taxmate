# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- **`UAE VAT 201 Filing Log` and `UAE ESR Filing` are now submittable (`is_submittable`).** Previously "marking as filed" was just a Select field anyone with write access could quietly re-edit afterwards -- not a real audit record despite being described as one. Submitting is now what locks a filing: Frappe's own docstatus mechanism (not a custom status flag) makes the boxes, dates and figures immutable once filed, and correcting a filed return requires Cancel + Amend, which is itself an audit trail. `generate()` on the VAT 201 log now refuses to run once submitted (previously it only blocked on a status string that nothing enforced).
- `UAE ESR Filing.regulatory_authority` is now required -- a filing record without knowing which authority it was filed with isn't a complete record.
- Added `Position / Title` to `UAE UBO Owner`, required when Basis of Control is the Senior Management Official fallback (Cabinet Decision 109/2023 requires this, not just the fallback flag itself).
- The daily status-refresh job now skips submitted ESR filings (they're intentionally locked) instead of resaving them pointlessly every night.
- VAT 201 Boxes 3/10 now exclude cancelled GL entries (`is_cancelled = 0`); Boxes 1/4/5 treat NULL exempt/zero-rated flags as 0 so legacy invoice lines are not dropped.
- Box 9 taxable amount uses `base_net_total`. Purchase Invoices for UAE companies now default `recoverable_standard_rated_expenses` from UAE VAT tax rows when blank, so Box 9 is not silently empty.
- Sales/Purchase Invoice cancel is blocked while an e-invoice is Queued or Generated, not only after ASP Submitted/Accepted.
- Company UAE readiness no longer runs twice on insert (`after_insert` + `on_update`).

### Known gap (not yet built)

- Cabinet Decision 109/2023 also requires a separate **Register of Partners or Shareholders** (direct legal ownership, distinct from the beneficial-ownership test in `UAE UBO Register`). Not implemented -- flagging this explicitly rather than letting `UAE UBO Register` be mistaken for full Cabinet Decision 109 coverage.

### Added

- **Phase 3 e-invoicing mandate:** B2C excluded until FTA requires it; VAT-group TIN (first 10 of TRN) on the PINT payload; 14-day transmission SLA on the e-invoice log/status report with daily ToDos; signed XML/PDF attached to the log as well as the invoice; accepted/submitted logs cannot be deleted (5-year retention note); `UAE E-Invoice Contingency` for downtime + 2-day FTA report checklist; inbound Corner-4 PI drafts match buyer TRN (no silent wrong company) and can auto-draft; **UAE E-Invoice VAT 201 Reconciliation** compares Accepted e-invoices to Box 1.

- **Phase 2 filing-grade VAT 201:** Box 1 VAT from UAE VAT accounts only (not every item tax); Boxes 6–7 auto-fill from submitted `UAE Customs Declaration` (still overridable); period lock on SI/PI after a Filing Log is submitted; Company TRN snapshot so one entity’s books are not filed under another TRN; due date = period end + 28 with ToDo reminders; accountant pack (box CSV, invoice listing, worksheet print/PDF). EmaraTax remains research-only — there is no public VAT 201 filing API as of 2026-09.

- **Phase 1 VAT operations:** bilingual Tax Invoice / Credit Note / Purchase Invoice print (AR/EN, VAT rate, tax summary, QR/hash placeholder, B2C ≤ AED 10,000 simplified); Item Tax Template blocked/partial recovery applied to line VAT for Box 9 (recompute unless Manual Box 9; purchase credit notes net); Designated Zone matrix (item type required, Out of Scope enforced for in-zone goods); credit-note reference on SI/PI; readiness gate on SI and self-billed PI; Peppol Verify on Company/Customer/Supplier.

- **New `UAE Compliance` module** — UBO (Ultimate Beneficial Owner) register and change-reporting tracker, and ESR (Economic Substance Regulations) notification/report filing tracker, with a shared `UAE Compliance Settings` doctype for the configurable deadlines (Cabinet Decision 109/2023's 15-day UBO change-reporting rule; ESR's notification/report deadlines, which vary by regulatory authority). Ships with:
  - `UAE UBO Register` (one per UAE company, auto-created on company creation) with a `UAE UBO Owner` child table (25%+ ownership/voting, control-basis tests, Senior Management Official fallback, ID expiry tracking) and a `UAE UBO Change Log` child table that computes each change's 15-day reporting deadline and status.
  - `UAE ESR Filing` (one per company per financial year) with a `UAE ESR Activity Row` child table for the 9 official Relevant Activities, exemption handling, and auto-computed (but manually overridable) notification/report due dates and status.
  - `UAE Compliance Status` report — one row per UAE company, UBO + ESR status side by side.
  - Daily scheduled jobs: refresh computed statuses so they reflect today's date even on untouched records, and raise a `ToDo` (Frappe's own reminder primitive — no bespoke notification engine) for anything approaching or past a deadline.
  - 20 unit tests for the deadline/status arithmetic (`tests/test_uae_compliance.py`).

  This module tracks and reminds — it does not file anything with the UBO registrar or a regulatory authority on your behalf; record the filing here after submitting it through the authority's own portal.

- `UAE VAT 201 Filing Log` doctype and `taxmate.uae_vat.utils.vat_201` — computes all 14 boxes of the FTA VAT 201 return from ledger data (reusing ERPNext's own emirate-wise/RCM/tourist-refund queries) plus the totals (Boxes 8, 11-14) ERPNext's regional report never calculated. Boxes 6/7 default from submitted UAE Customs Declarations and remain overridable.
- `UAE VAT 201 Box Detail` child doctype for the per-box breakdown shown on the Filing Log and in the report below.
- Unit tests for the Box 8/11/12/13/14 arithmetic (`tests/test_uae_vat_201.py`).

### Changed

- **`EmaraTax Export` report is no longer a stub.** It now renders the full VAT 201 worksheet (all 14 boxes, company/period filters, optional live Box 6/7 what-if inputs) and can save itself as a `UAE VAT 201 Filing Log` for an audit trail. It still does not submit anything to the FTA — no EmaraTax filing API has been confirmed to exist; see the TaxMate UAE Gap Analysis & Build Plan for the research spike needed before that's attempted.

## [0.1.0.0] - 2026-08-27

### Added

- UAE VAT regional setup orchestrating ERPNext UAE features (custom fields, tax templates, print formats, VAT 201 report integration)
- TaxMate Settings doctype with TRN validation and Emirate enforcement flags
- UAE e-invoicing module with PINT-AE payload builder and Flick ASP integration
- Sales and Purchase Invoice overrides for e-invoice generation, status tracking, and cancellation guards
- UAE Tax Settings, E-Invoice Log, Incoming Invoice, and Webhook Log doctypes
- Bilingual UAE tax invoice print format and EmaraTax export report
- E-invoice status report, background retry/polling jobs, and webhook handler with HMAC verification
- Desk client scripts for company, sales/purchase invoices, and party TRN validation
- Arabic translations for UAE compliance labels
- Unit tests for PINT-AE payloads, Flick mapping, rounding, and code lists (25 tests)

### Changed

- README updated with UAE localization and installation instructions for version-16 branch
