"""Append-only audit of VAT recoverability and Box 6/7 overrides."""

from __future__ import annotations

from frappe.utils import cstr, flt, now_datetime


def log_field_changes(doc, fields: tuple[str, ...]) -> None:
	"""Insert UAE VAT Audit Event rows when listed fields change on save."""
	import frappe

	if not doc.get("name") or doc.is_new():
		return
	if not frappe.db.exists("DocType", "UAE VAT Audit Event"):
		return
	if not frappe.db.exists(doc.doctype, doc.name):
		return
	previous = frappe.db.get_value(doc.doctype, doc.name, list(fields), as_dict=True) or {}
	for fieldname in fields:
		if not doc.meta.has_field(fieldname):
			continue
		old = previous.get(fieldname)
		new = doc.get(fieldname)
		if _same(old, new):
			continue
		event = frappe.get_doc(
			{
				"doctype": "UAE VAT Audit Event",
				"company": doc.get("company"),
				"ref_doctype": doc.doctype,
				"ref_name": doc.name,
				"fieldname": fieldname,
				"old_value": _as_text(old),
				"new_value": _as_text(new),
				"changed_by": frappe.session.user,
				"changed_on": now_datetime(),
			}
		)
		event.flags.from_vat_audit = True
		event.flags.ignore_permissions = True
		event.insert()


def _same(old, new) -> bool:
	if old is None and new in (None, "", 0, 0.0):
		return True
	try:
		return flt(old) == flt(new)
	except Exception:
		return cstr(old) == cstr(new)


def _as_text(value) -> str:
	if value is None:
		return ""
	return cstr(value)
