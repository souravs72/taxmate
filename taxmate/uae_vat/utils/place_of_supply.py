"""Place of supply / designated-zone matrix for UAE invoices."""

from __future__ import annotations

import frappe
from frappe import _

from frappe.utils import flt

from taxmate.uae.constants import SIMPLIFIED_TAX_INVOICE_THRESHOLD_AED, UAE_COUNTRY
from taxmate.uae.validation import setting_enabled

_GOODS_TYPES = frozenset({"Goods", "Both"})
_OUT_OF_SCOPE_OK = frozenset({"Out of Scope"})


def is_simplified_tax_invoice(has_buyer_trn: bool, base_grand_total: float) -> bool:
	"""True for B2C supplies at or under the FTA simplified-invoice threshold."""
	if has_buyer_trn:
		return False
	return abs(flt(base_grand_total)) <= SIMPLIFIED_TAX_INVOICE_THRESHOLD_AED


def expected_vat_category(company_in_dz: bool, party_in_dz: bool, item_type: str | None) -> str | None:
	"""Return the FTA-driven category when TaxMate can determine it.

	Goods that stay between two Designated Zone establishments are typically
	out of scope of UAE VAT. Services are not decided by this goods rule.
	Mainland ↔ DZ goods stay on the Item Tax Template (Standard / zero / exempt / RCM).
	"""
	if company_in_dz and party_in_dz and (item_type or "") in _GOODS_TYPES:
		return "Out of Scope"
	return None


def designated_zone_guidance(company_in_dz: bool, party_in_dz: bool, has_goods: bool) -> str | None:
	"""Operator guidance when a designated-zone goods supply may be out of scope."""
	if company_in_dz and party_in_dz and has_goods:
		return _(
			"Supplier and customer are both in a Designated Zone. Supplies of goods "
			"that remain in the zone are out of scope of UAE VAT. The Item Tax Template "
			"UAE VAT Category must be Out of Scope."
		)
	return None


def validate_return_reference(doc) -> None:
	"""Require original-invoice reference and reason on UAE returns."""
	if not doc.get("is_return"):
		return
	if not setting_enabled("enforce_credit_note_reference", default=1):
		return

	if not doc.get("return_against") and not doc.get("uae_return_against_external"):
		frappe.throw(
			_(
				"Credit Notes must reference the original tax invoice. Set Return Against, "
				"or External Return Against if the original was issued outside TaxMate."
			),
			title=_("Credit Note Reference"),
		)
	if not doc.get("uae_credit_note_reason"):
		frappe.throw(
			_("UAE Credit Note Reason is required for Credit Notes."),
			title=_("Credit Note Reason"),
		)


def designated_zone_fz_guidance(buyer_doctype: str, fz_id: str | None) -> str | None:
	"""Orange Desk hint for BTAE-01 — e-invoice validate throws if the buyer still has no FZ ID."""
	if (fz_id or "").strip():
		return None
	return _(
		"Free Zone / Designated Zone supply: set FZ Beneficiary ID on the buyer ({0}) "
		"when the e-invoice requires BTAE-01 / IBR-007-ae."
	).format(buyer_doctype)


def validate_sales_invoice(doc) -> None:
	"""Enforce Emirate, credit-note, and designated-zone category rules on sales."""
	if not _is_uae_company(doc):
		return

	if setting_enabled("require_vat_emirate_on_invoice", default=1) and not doc.get("vat_emirate"):
		frappe.throw(
			_("Set Place of Supply (Emirate) on this invoice. VAT 201 Box 1 is reported by Emirate."),
			title=_("Place of Supply"),
		)

	validate_return_reference(doc)
	_validate_designated_zone(
		doc,
		party_doctype="Customer",
		party_name=doc.get("customer"),
		buyer_doctype="Customer",
		buyer_name=doc.get("customer"),
	)


def validate_purchase_invoice(doc) -> None:
	"""Enforce credit-note and designated-zone category rules on purchases."""
	if not _is_uae_company(doc):
		return

	validate_return_reference(doc)
	_validate_designated_zone(
		doc,
		party_doctype="Supplier",
		party_name=doc.get("supplier"),
		buyer_doctype="Company",
		buyer_name=doc.get("company"),
	)


def _is_uae_company(doc) -> bool:
	company = doc.get("company")
	if not company:
		return False
	return frappe.db.get_value("Company", company, "country") == UAE_COUNTRY


def _zone_flag(doctype: str, name: str | None) -> bool:
	if not name or not frappe.db.has_column(doctype, "uae_in_designated_zone"):
		return False
	return bool(frappe.db.get_value(doctype, name, "uae_in_designated_zone"))


def _template_categories(template_names: list[str]) -> dict[str, str]:
	unique = list({name for name in template_names if name})
	if not unique or not frappe.db.has_column("Item Tax Template", "uae_vat_category"):
		return {}
	rows = frappe.get_all(
		"Item Tax Template",
		filters={"name": ["in", unique]},
		fields=["name", "uae_vat_category"],
	)
	return {row.name: (row.uae_vat_category or "") for row in rows}


def _validate_designated_zone(
	doc,
	*,
	party_doctype: str,
	party_name: str | None,
	buyer_doctype: str,
	buyer_name: str | None,
) -> None:
	company = doc.get("company")
	company_dz = _zone_flag("Company", company)
	party_dz = _zone_flag(party_doctype, party_name)
	if not company_dz and not party_dz:
		return

	items = doc.get("items") or []
	missing_type = [row.idx for row in items if not row.get("uae_item_type")]
	if missing_type:
		frappe.throw(
			_(
				"UAE Item Type is required on row(s) {0} when the company or party "
				"is in a Designated Zone (goods vs services changes the VAT treatment)."
			).format(", ".join(str(i) for i in missing_type)),
			title=_("Designated Zone"),
		)

	categories = _template_categories([row.get("item_tax_template") for row in items])
	for row in items:
		expected = expected_vat_category(company_dz, party_dz, row.get("uae_item_type"))
		if expected != "Out of Scope":
			continue
		actual = categories.get(row.get("item_tax_template") or "", "")
		if actual not in _OUT_OF_SCOPE_OK:
			frappe.throw(
				_(
					"Row #{0}: goods remaining in a Designated Zone must use an Item Tax "
					"Template with UAE VAT Category = Out of Scope (found {1})."
				).format(row.idx, actual or _("blank")),
				title=_("Designated Zone"),
			)

	if company_dz or party_dz:
		fz_id = None
		if buyer_name and frappe.db.has_column(buyer_doctype, "uae_fz_beneficiary_id"):
			fz_id = frappe.db.get_value(buyer_doctype, buyer_name, "uae_fz_beneficiary_id")
		hint = designated_zone_fz_guidance(buyer_doctype, fz_id)
		if hint:
			frappe.msgprint(
				hint,
				title=_("FZ Beneficiary"),
				indicator="orange",
				alert=True,
			)
