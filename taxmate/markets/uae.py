"""UAE market profile for TaxMate dashboards and compliance copy."""

from __future__ import annotations

from typing import Any

MARKET: dict[str, Any] = {
	"code": "AE",
	"name": "United Arab Emirates",
	"currency": "AED",
	"filings": (
		{"kind": "vat", "label_key": "market.filing.vat"},
		{"kind": "ct", "label_key": "market.filing.ct"},
	),
	"countries": ("United Arab Emirates", "UAE"),
}
