"""Phase 7 multi-entity constants (VAT group, establishments, roles)."""

from __future__ import annotations

TAX_MANAGER_ROLE = "UAE Tax Manager"

ESTABLISHMENT_TYPES = (
	"Mainland",
	"Free Zone",
	"Designated Zone",
)

AUDIT_PI_FIELDS = (
	"uae_box_9_manual",
	"recoverable_standard_rated_expenses",
	"uae_box_9_taxable_amount",
)

AUDIT_VAT201_FIELDS = (
	"boxes_6_7_manual",
	"box_6_amount",
	"box_6_vat_amount",
	"box_7_amount",
	"box_7_vat_amount",
)

TAX_MANAGER_FILING_DOCTYPES = (
	"UAE VAT 201 Filing Log",
	"UAE VAT Group",
	"UAE Customs Declaration",
	"UAE Excise Filing Log",
	"UAE Bad Debt Relief",
	"UAE Capital Goods Adjustment",
	"UAE CT Filing Log",
	"UAE ESR Filing",
)
