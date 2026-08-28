"""Deterministic decimal rounding per FTA guidance (ROUND_HALF_UP)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

TWO_PLACES = Decimal("0.01")
SIX_PLACES = Decimal("0.000001")


def to_decimal(value) -> Decimal:
	if value is None:
		return Decimal("0")
	return Decimal(str(value))


def r2(value) -> float:
	"""Round to 2 decimal places, HALF-UP (monetary amounts)."""
	return float(to_decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP))


def r6(value) -> float:
	"""Round to 6 decimal places, HALF-UP (exchange rates)."""
	return float(to_decimal(value).quantize(SIX_PLACES, rounding=ROUND_HALF_UP))
