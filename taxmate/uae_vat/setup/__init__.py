"""UAE VAT module setup — custom fields and related fixtures."""

from __future__ import annotations

from taxmate.uae_vat.constants.custom_fields import CUSTOM_FIELDS
from taxmate.utils.custom_fields import get_custom_fields_creator

create_custom_fields = get_custom_fields_creator("UAE VAT")


def setup():
	"""Create TaxMate UAE VAT custom fields (idempotent)."""
	create_custom_fields(CUSTOM_FIELDS, ignore_validate=True, update=True)
