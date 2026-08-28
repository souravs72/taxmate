# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
