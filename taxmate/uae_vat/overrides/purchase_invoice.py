"""Purchase Invoice hooks for UAE VAT 201 Box 9 and credit notes.

Called from hooks.py Purchase Invoice.validate.
"""

from __future__ import annotations

import frappe
from frappe import _

from taxmate.uae_vat.constants.tenancy import AUDIT_PI_FIELDS
from taxmate.uae_vat.utils.period_lock import validate_period_lock
from taxmate.uae_vat.utils.place_of_supply import validate_purchase_invoice
from taxmate.uae_vat.utils.recoverability import apply_box_9_recoverable
from taxmate.uae_vat.utils.vat_audit import log_field_changes


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
