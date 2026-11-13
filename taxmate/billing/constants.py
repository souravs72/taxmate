"""Billing constants shared by APIs and patches."""

from __future__ import annotations

PLAN_STARTER = "starter"
PLAN_RETAIL = "retail"
PLAN_MULTI = "multi_outlet"

STATUS_TRIAL = "Trial"
STATUS_ACTIVE = "Active"
STATUS_PAST_DUE = "Past Due"
STATUS_UNPAID = "Unpaid"

CYCLE_MONTHLY = "Monthly"
CYCLE_ANNUAL = "Annual"

SUBSCRIPTION_DOCTYPE = "TaxMate Company Subscription"
PLAN_DOCTYPE = "TaxMate Plan"
SI_COMPANY_FIELD = "custom_taxmate_company"
SI_PLAN_FIELD = "custom_taxmate_plan"
SI_CYCLE_FIELD = "custom_taxmate_billing_cycle"

DEFAULT_TRIAL_DAYS = 7
