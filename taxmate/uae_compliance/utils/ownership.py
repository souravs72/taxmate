"""Pure helpers for legal ownership vs beneficial ownership (Cabinet Decision 109)."""

from __future__ import annotations

from taxmate.uae_compliance.constants import (
	SHAREHOLDER_STATUS_EMPTY,
	SHAREHOLDER_STATUS_MISSING,
	SHAREHOLDER_STATUS_ON_FILE,
)


def chain_resolves_to_natural_person(person_type: str | None, ultimate_natural_person: str | None) -> bool:
	"""A Legal Entity UBO is incomplete until the natural person at the end of the chain is named."""
	if (person_type or "Natural Person") != "Legal Entity":
		return True
	return bool((ultimate_natural_person or "").strip())


def nominee_named(is_nominee: int | bool, nominee_for: str | None) -> bool:
	if not is_nominee:
		return True
	return bool((nominee_for or "").strip())


def shareholder_register_status(active_count: int | None, register_exists: bool = True) -> str:
	if not register_exists:
		return SHAREHOLDER_STATUS_MISSING
	if int(active_count or 0) > 0:
		return SHAREHOLDER_STATUS_ON_FILE
	return SHAREHOLDER_STATUS_EMPTY


def registers_complete(ubo_exists: bool, shareholder_exists: bool) -> bool:
	"""Exit criterion: both the UBO register and the legal shareholder register exist."""
	return bool(ubo_exists and shareholder_exists)
