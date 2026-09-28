# Dashboard IDP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every user-facing IDP job on the TaxMate dashboard, for a UAE company, with the screen only rendering decisions the backend already made.

**Architecture:** `taxmate.idp.desk` owns the jobs, the document types, the UAE rules, and whether a job can run. `taxmate.api.idp_desk` is a thin whitelist in `get_catalog()`. The React panel renders that payload. It does not choose document types, permissions, or whether a scan may submit.

**Tech Stack:** Frappe 16 whitelist methods, ERPNext document types IDP already supports, TaxMate React SPA (`frappe-react-sdk`), IDP upload and agent.

**Spec:** This plan is the spec. IDP user jobs are create, compare, search, update, match, and delete. Internal agent tools (ask, audit, validate, read-more) stay off the dashboard. Creating a new customer, supplier, or item from a scan stays off. A scan saves a draft. Submit stays on the TaxMate document. No link may point at Desk `/app/`.

## Global Constraints

- SPA calls go through `taxmate.api.get_catalog()`.
- Frontend renders. Backend decides.
- UAE: draft only, existing masters only, English and Arabic files.
- Do not call OpenAI from tests.
- Opportunity has no TaxMate screen, so it is listed and not linked.

## Review Focus

- A job the user cannot permission is absent.
- A route is either a TaxMate path or null.
- The panel has a name, a close control, and Escape.
- Strings exist in English and Arabic.

## Phases

### Phase 1 — Surface

- [x] `build_surface` returns the six jobs, notices, and targets.
- [x] Whitelist `taxmate.api.idp_desk.get_surface` is in the catalog.
- [x] Dashboard `+ Scan` opens a panel that renders that payload on both dashboard views.
- [x] Unit tests pass.

### Phase 2 — Create a draft from a file

- [x] Upload stays on a TaxMate method and stores a private file.
- [x] `run` with action `create` checks permission, file type, and target, then asks IDP to read the file.
- [x] The panel shows the review the backend returns and saves a draft only.
- [x] Tests cover refusal paths without calling OpenAI.

### Phase 3 — Find, compare, match

- [x] Search, compare, and match run through the same `run` method.
- [x] Results are TaxMate routes when the document has a screen.

### Phase 4 — Update and delete

- [x] Update applies only after the backend returns a diff the user confirms.
- [x] Delete is draft-only and requires delete permission.

Each phase is reviewed against this plan and the Frappe catalog rule before the next phase starts.
