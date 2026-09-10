### TaxMate

A cloud accounting SaaS platform for businesses to manage bookkeeping, taxation, and financial reporting.

### UAE localization

TaxMate is UAE-first. It **orchestrates** ERPNext’s built-in UAE VAT features (regional fields, tax templates, print formats, UAE VAT Settings, UAE VAT 201) and does **not** modify ERPNext core.

- On install/migrate, TaxMate applies ERPNext UAE regional setup so fields and print formats are ready before company onboarding.
- When `Company.country` is **United Arab Emirates**, TaxMate runs readiness checks (TRN, tax templates, VAT settings, Emirate, print formats).
- Enforcement flags live in **TaxMate Settings** (TRN validation, require Emirate on UAE addresses).
- Item Tax Templates get TaxMate `uae_vat_category` stamped (Standard / Zero Rated / Exempt).
- Standard Modes of Payment get UAE payment means codes (UNCL 4461) for e-invoicing.

See [UAE VAT setup](https://docs.frappe.io/erpnext/UAE-vat-setup) and [UAE VAT 201](https://docs.frappe.io/erpnext/uae-vat-201-report).

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch version-16
bench install-app taxmate
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/taxmate
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade
### CI

This app can use GitHub Actions for CI. The following workflows are configured:

- CI: Installs this app and runs unit tests on every push to `develop` branch.
- Linters: Runs [Frappe Semgrep Rules](https://github.com/frappe/semgrep-rules) and [pip-audit](https://pypi.org/project/pip-audit/) on every pull request.


### License

mit
