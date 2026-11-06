"""Render a print format for the SPA preview screen.

Callers: SPA METHOD.printFormats / METHOD.printRender (screens/print).
The SPA shows what comes back and never builds a format itself — picking
the format, the language and the letterhead happens here, where the
permission check is.

Why not point the SPA straight at /printview: that page renders in the
session language and auto-prints. The preview screen needs the same
document in either language, on demand, without leaving the app.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any

import frappe
from frappe import _
from frappe.translate import print_language

from taxmate.api.resource import assert_allowed_doctype, require_login

# SPA language codes -> Frappe Language names.
_LANG = {"en": "en", "ar": "ar"}

# Frappe always offers this; it is not a Print Format record.
STANDARD = "Standard"

# Used only if frappe.get_module_list is unavailable; mirrors modules.txt.
_FALLBACK_MODULES = ("TaxMate", "UAE VAT", "UAE E-Invoicing", "UAE Corporate Tax", "UAE Compliance")


def _assert_can_print(doctype: str, name: str) -> None:
	assert_allowed_doctype(doctype)
	if not frappe.db.exists(doctype, name):
		frappe.throw(_("{0} {1} not found").format(_(doctype), name), frappe.DoesNotExistError)
	# Desk's validate_print_permission allows read or print.
	if not (
		frappe.has_permission(doctype, "print", doc=name)
		or frappe.has_permission(doctype, "read", doc=name)
	):
		frappe.throw(_("Not permitted to print {0}").format(_(doctype)), frappe.PermissionError)


@contextmanager
def _in_language(lang: str | None):
	"""Render inside *lang* so _() and tm_is_arabic() follow the request.

	Frappe's ``print_language`` rebuilds the Jinja env for that language.
	``lang_full_dict`` is cleared as well so ``_()`` outside Jinja does not
	keep answering in the request language.
	"""
	cached = getattr(frappe.local, "lang_full_dict", None)
	if lang:
		frappe.local.lang_full_dict = None
	try:
		with print_language(lang or ""):
			yield
	finally:
		frappe.local.lang_full_dict = cached


def _our_modules() -> set[str]:
	"""Every module this app owns, read from its modules.txt.

	A format counts as ours by module. Checking for the single module named
	"TaxMate" missed all five bilingual formats, which live in UAE
	E-Invoicing, UAE VAT and UAE Corporate Tax: none of them ever sorted
	first, and none was ever picked as a doctype's default.
	"""
	try:
		return set(frappe.get_module_list("taxmate"))
	except Exception:
		return set(_FALLBACK_MODULES)


def _formats_for(doctype: str) -> list[dict[str, Any]]:
	"""Enabled formats for *doctype*, this app's own first, Standard last."""
	rows = frappe.get_all(
		"Print Format",
		filters={"doc_type": doctype, "disabled": 0},
		fields=["name", "standard", "module"],
		order_by="name asc",
		limit_page_length=0,
	)
	mine = _our_modules()
	ours, theirs = [], []
	for row in rows:
		entry = {"name": row["name"], "label": _(row["name"]), "taxmate": row.get("module") in mine}
		(ours if entry["taxmate"] else theirs).append(entry)
	return [*ours, *theirs, {"name": STANDARD, "label": _(STANDARD), "taxmate": False}]


def _default_format(doctype: str, formats: list[dict[str, Any]]) -> str:
	"""The doctype's own default, else TaxMate's, else the first on offer."""
	configured = frappe.db.get_value("Property Setter", {
		"doc_type": doctype, "property": "default_print_format",
	}, "value")
	names = [f["name"] for f in formats]
	if configured and configured in names:
		return configured
	for f in formats:
		if f["taxmate"]:
			return f["name"]
	return names[0] if names else STANDARD


@frappe.whitelist()
def print_formats(doctype: str) -> dict[str, Any]:
	"""Formats the preview screen can offer for *doctype*."""
	require_login()
	assert_allowed_doctype(doctype)
	formats = _formats_for(doctype)
	return {"formats": formats, "default": _default_format(doctype, formats)}


@frappe.whitelist()
def render(
	doctype: str,
	name: str,
	print_format: str | None = None,
	language: str | None = None,
	letterhead: int | str = 1,
) -> dict[str, Any]:
	"""Rendered HTML plus the style for one document, in one language."""
	require_login()
	_assert_can_print(doctype, name)

	formats = _formats_for(doctype)
	names = [f["name"] for f in formats]
	chosen = print_format if print_format in names else _default_format(doctype, formats)

	lang = _LANG.get(str(language or "").strip())
	no_letterhead = 0 if frappe.utils.cint(letterhead) else 1

	from frappe.www.printview import get_html_and_style

	with _in_language(lang):
		out = get_html_and_style(
			doc=doctype,
			name=name,
			print_format=None if chosen == STANDARD else chosen,
			no_letterhead=no_letterhead,
		)
		# Re-read the labels inside the language block: _() outside it answers
		# in the request language, not the print language.
		labelled = [{**f, "label": _(f["name"])} for f in formats]

	return {
		"html": out.get("html"),
		"style": out.get("style"),
		"format": chosen,
		"formats": labelled,
		"language": lang or frappe.local.lang,
		"letterhead": 0 if no_letterhead else 1,
	}
