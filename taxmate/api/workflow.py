"""Submit / cancel / amend for allowlisted accounts documents."""

from __future__ import annotations

import frappe
from frappe import _
from frappe.client import cancel as client_cancel

from taxmate.api.resource import _parse, assert_allowed_doctype


@frappe.whitelist(methods=["POST", "PUT"])
def submit(doc):
	"""Submit by name. Reloads from the database so clients need not send `modified`."""
	doc = _parse(doc)
	if not doc or not doc.get("doctype"):
		frappe.throw(_("doctype is required"))
	assert_allowed_doctype(doc["doctype"])
	name = doc.get("name")
	if not name:
		frappe.throw(_("name is required"))
	loaded = frappe.get_doc(doc["doctype"], name)
	loaded.check_permission("write")
	loaded.submit()
	return loaded.as_dict()


@frappe.whitelist(methods=["POST", "PUT"])
def cancel(doctype, name):
	assert_allowed_doctype(doctype)
	return client_cancel(doctype, name)


@frappe.whitelist(methods=["POST"])
def amend(doctype: str, name: str):
	"""Insert a draft copy of a cancelled document (Frappe amend)."""
	assert_allowed_doctype(doctype)
	source = frappe.get_doc(doctype, name)
	source.check_permission("write")
	if source.docstatus != 2:
		frappe.throw(_("Only cancelled documents can be amended"))

	new_doc = frappe.copy_doc(source)
	new_doc.docstatus = 0
	new_doc.amended_from = source.name
	new_doc.insert()
	return new_doc.as_dict()
