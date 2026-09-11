"""UAE special-regime constants (excise, capital goods, bad debt, margin).

References:
- Federal Decree-Law No. 7 of 2017 (Excise Tax) and Cabinet Decision rates
- VAT Executive Regulation capital assets scheme (Art. 58)
- VAT Decree-Law bad-debt relief (typically six months after due date)
"""

from __future__ import annotations

EXCISE_CATEGORIES = (
	"Tobacco and tobacco products",
	"Carbonated drinks",
	"Energy drinks",
	"Sweetened drinks",
	"Electronic smoking devices",
	"Liquids used in electronic smoking devices",
)

# FTA designated rates (percent of the tax base). Override on UAE Excise Settings.
DEFAULT_EXCISE_RATES = {
	"Tobacco and tobacco products": 100,
	"Carbonated drinks": 50,
	"Energy drinks": 100,
	"Sweetened drinks": 50,
	"Electronic smoking devices": 100,
	"Liquids used in electronic smoking devices": 100,
}

CAPITAL_GOODS_THRESHOLD_AED = 5_000_000
CAPITAL_YEARS_IMMOVABLE = 10
CAPITAL_YEARS_OTHER = 5

BAD_DEBT_RELIEF_MONTHS = 6

STANDARD_VAT_RATE = 5.0
