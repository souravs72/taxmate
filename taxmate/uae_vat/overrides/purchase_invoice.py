"""Purchase Invoice hooks for UAE VAT 201 Box 9 and credit notes.

Called from hooks.py Purchase Invoice.validate.
"""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae_vat.constants.tenancy import AUDIT_PI_FIELDS
from taxmate.uae_vat.utils.period_lock import validate_period_lock
from taxmate.uae_vat.utils.place_of_supply import validate_purchase_invoice
from taxmate.uae_vat.utils.recoverability import apply_box_9_recoverable
from taxmate.uae_vat.utils.vat_audit import log_field_changes


def _bind_reverse_charge_region() -> None:
	"""Select ERPNext's UAE regional ledger from the invoice company.

	``update_grand_total_for_rcm`` removes VAT from the supplier total using
	Company.country. The matching credit is chosen by ``erpnext.get_region()``,
	which reads System Settings country unless ``frappe.flags.company`` is set
	on that call. Setting the flag earlier is not enough: ``get_gl_entries``
	does not keep it until ``make_regional_gl_entries`` runs.
	"""
	import erpnext.accounts.doctype.purchase_invoice.purchase_invoice as purchase_invoice

	current = purchase_invoice.make_regional_gl_entries
	if getattr(current, "_taxmate_reverse_charge", False):
		return

	def make_regional_gl_entries(gl_entries, doc):
		company = doc.get("company") if doc else None
		country = frappe.get_cached_value("Company", company, "country") if company else None
		if country != UAE_COUNTRY:
			return current(gl_entries, doc)

		previous_company = frappe.flags.company
		previous_country = frappe.flags.country
		frappe.flags.company = company
		frappe.flags.country = UAE_COUNTRY
		try:
			return current(gl_entries, doc)
		finally:
			frappe.flags.company = previous_company
			frappe.flags.country = previous_country

	make_regional_gl_entries._taxmate_reverse_charge = True
	purchase_invoice.make_regional_gl_entries = make_regional_gl_entries


class PurchaseInvoiceReverseCharge:
	"""Install the reverse-charge region binding before ERPNext builds the ledger."""

	def get_gl_entries(self, inventory_account_map=None):
		_bind_reverse_charge_region()
		return super().get_gl_entries(inventory_account_map)


def validate(doc, method=None):
	apply_box_9_recoverable(doc)
	validate_purchase_invoice(doc)
	validate_period_lock(doc)
	_apply_establishment(doc)
	log_field_changes(doc, AUDIT_PI_FIELDS)


def _apply_establishment(doc):
	if not hasattr(doc, "uae_establishment") or not frappe.db.exists("DocType", "UAE Establishment"):
		return
	if not doc.get("uae_establishment"):
		head = frappe.db.get_value("UAE Establishment", {"company": doc.company, "is_head_office": 1}, "name")
		if head:
			doc.uae_establishment = head
		return
	est_company = frappe.db.get_value("UAE Establishment", doc.uae_establishment, "company")
	if est_company and est_company != doc.company:
		frappe.throw(_("Establishment {0} belongs to {1}.").format(doc.uae_establishment, est_company))


def before_cancel(doc, method=None):
	validate_period_lock(doc)


def default_recoverable_standard_rated_expenses(doc) -> None:
	"""Back-compat alias — Box 9 is applied in ``validate``."""
	apply_box_9_recoverable(doc)


# Bind as soon as this module loads (Purchase Invoice controller import and
# after_install), not only on the first get_gl_entries call.
_bind_reverse_charge_region()
