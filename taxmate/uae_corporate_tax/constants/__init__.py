"""UAE Corporate Tax (Federal Decree-Law No. 47 of 2022) constants.

Thresholds as published by the FTA for tax periods through 2026-12-31.
"""

from __future__ import annotations

# Cabinet Decision 116/2022 — standard rates
ZERO_RATE_BAND_AED = 375_000.0
STANDARD_RATE_PERCENT = 9.0

# Ministerial Decision 73/2023 — Small Business Relief
SBR_REVENUE_THRESHOLD_AED = 3_000_000.0
SBR_LAST_PERIOD_END = "2026-12-31"

# QFZP de minimis — lower of 5% of total revenue or AED 5,000,000
DE_MINIMIS_PERCENT = 5.0
DE_MINIMIS_AMOUNT_AED = 5_000_000.0

# Return and payment: 9 months after the tax period end
FILING_MONTHS_AFTER_PERIOD = 9

ADJUSTMENT_CATEGORIES = (
	"Entertainment",
	"Related Party",
	"Depreciation",
	"Unrealised FX",
	"Other",
)

FTA_RETURN_NOTE = (
	"As of 2026-09 the FTA has not published a public Corporate Tax e-file API in TaxMate. "
	"This worksheet is for portal typing and audit backup. Submitting the log does not file the return."
)
