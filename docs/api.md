# TaxMate accounts API

Custom frontends talk to TaxMate over the same authenticated HTTP surface Desk uses. Start at `taxmate.api.get_catalog`, then call resource/workflow/accounts methods listed there.

## Auth

```
Authorization: token <api_key>:<api_secret>
```

Session cookies work for a logged-in user. Guest is rejected.

## Discovery

```
POST /api/method/taxmate.api.get_catalog
POST /api/method/taxmate.api.get_session
POST /api/method/taxmate.api.dashboard.get_home
```

`get_catalog` returns product DocTypes (invoices, parties, COA, UAE filings), financial reports, and RPC method names. DocTypes outside the TaxMate product surface (HR, manufacturing, CRM) are rejected.

## Documents

| Action | Method |
| --- | --- |
| List | `taxmate.api.resource.get_list` |
| Count | `taxmate.api.resource.get_count` |
| Get | `taxmate.api.resource.get` |
| Create | `taxmate.api.resource.insert` |
| Update | `taxmate.api.resource.save` |
| Delete | `taxmate.api.resource.delete` |
| Form fields | `taxmate.api.resource.get_meta` |
| Link search | `taxmate.api.resource.search_link` |
| Submit | `taxmate.api.workflow.submit` |
| Cancel | `taxmate.api.workflow.cancel` |
| Amend | `taxmate.api.workflow.amend` |

`/api/resource/<DocType>` still works; the TaxMate methods add the product allowlist.

Example — draft a customer:

```
POST /api/method/taxmate.api.resource.insert
{
  "doc": {
    "doctype": "Customer",
    "customer_name": "Acme LLC",
    "customer_type": "Company",
    "customer_group": "Commercial",
    "territory": "United Arab Emirates"
  }
}
```

Example — submit an invoice:

```
POST /api/method/taxmate.api.workflow.submit
{"doc": {"doctype": "Sales Invoice", "name": "ACC-SINV-2026-00001"}}
```

## Books helpers

| Need | Method |
| --- | --- |
| Company / FY / currency | `taxmate.api.accounts.get_defaults` |
| Customer or supplier defaults on a voucher | `taxmate.api.accounts.get_party_details` |
| Item rate, tax, warehouse | `taxmate.api.accounts.get_item_details` |
| Chart of Accounts tree | `taxmate.api.accounts.get_account_tree` |
| Unpaid invoices | `taxmate.api.accounts.get_outstanding_invoices` |
| Payment Entry from an invoice | `taxmate.api.accounts.get_payment_entry` |
| Credit note draft | `taxmate.api.accounts.make_sales_return` |
| Debit note draft | `taxmate.api.accounts.make_purchase_return` |

`get_payment_entry` and return helpers return an unsaved document. Insert it with `taxmate.api.resource.insert`, then submit.

## Reports

```
POST /api/method/taxmate.api.reports.list_reports
POST /api/method/taxmate.api.reports.run_report
{"report_name": "General Ledger", "filters": {"company": "Tax Mate", "from_date": "2026-01-01", "to_date": "2026-12-31"}}
```

Reports are the Financial Reports workspace set (P&L, Balance Sheet, GL, AR/AP, UAE VAT 201, …).

## UAE actions already on TaxMate

The catalog lists existing methods (do not wrap twice):

- `taxmate.uae.readiness.get_uae_readiness_checklist`
- `taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice`
- `taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.get_or_create`
- VAT 201 `generate` / `export_accountant_pack` on the Filing Log document (`POST /api/method/run_doc_method`)

## How to test

```
bench --site taxmate.site run-tests --module taxmate.tests.test_api
bench --site taxmate.site execute taxmate.api.get_catalog
```
