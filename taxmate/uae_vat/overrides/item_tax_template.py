"""Fill TaxMate's required UAE VAT Category on Item Tax Template.

ERPNext creates UAE Item Tax Templates during Company.insert via
``erpnext.setup.setup_wizard.operations.taxes_setup.make_item_tax_template``.
That path sets ``flags.ignore_validate`` but not ``ignore_mandatory``. Frappe
still runs ``before_validate``, then ``_validate_mandatory``.

TaxMate's Custom Field ``uae_vat_category`` is reqd, so Desk company create
failed with: Value missing for Item Tax Template: UAE VAT Category.
"""

from __future__ import annotations

from taxmate.uae.setup import vat_category_for_item_tax_title

# FTA default when ERPNext (or tests) insert a template with no category.
# Title mapping still overrides this for UAE VAT Zero / Exempt / Excise.
_DEFAULT_CATEGORY = "Standard"


def before_validate(doc, method=None):
	"""Stamp ``uae_vat_category`` before Frappe's mandatory check."""
	if not doc.meta.has_field("uae_vat_category"):
		return

	mapped = vat_category_for_item_tax_title(doc.get("title") or doc.get("name"))
	if mapped:
		doc.uae_vat_category = mapped
		return

	if not doc.get("uae_vat_category"):
		doc.uae_vat_category = _DEFAULT_CATEGORY
