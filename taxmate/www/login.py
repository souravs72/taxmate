# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""TaxMate-branded /login. Auth is still Frappe's.

This file, together with ``login.html``, replaces Frappe's stock login page at
``/login``. Frappe resolves a website path by scanning every installed app's
``www`` folder in reverse install order (frappe/website/page_renderers/
template_page.py). TaxMate is the only remaining installed app that ships
``www/login.html``, so it wins ``/login``.

Everything about authentication stays Frappe's:

* ``frappe.www.login.get_context`` still builds the context, so the
  already-signed-in redirect, ``redirect-to`` sanitising, social logins, LDAP,
  the signup switch and the login label all behave exactly as before. This file
  only adds the strings the TaxMate layout shows.
* The page posts to ``/api/method/login`` and to Frappe's own whitelisted
  guest endpoints. No new endpoint is added, so nothing new is exposed.

If this page is ever removed, Frappe's own login page takes over again with no
other change.
"""

from urllib.parse import quote, unquote

import frappe
from frappe import _
from frappe.utils import cint
from frappe.www.login import get_context as frappe_login_context

TAXMATE_LOGO = "/assets/taxmate/logo.svg"
_ERPNEXT_DEFAULT_LOGO = "/assets/erpnext/images/erpnext-logo.svg"

no_cache = True
sitemap = 0


def get_context(context):
	# Frappe's own context first: it redirects a signed-in user away, sanitises
	# ``redirect-to``, and fills logo, app_name, provider_logins, ldap_settings,
	# disable_signup, login_label and login_with_email_link.
	context = frappe_login_context(context)

	context.full_width = 1
	context.no_breadcrumbs = 1
	context.no_sidebar = 1
	context.show_sidebar = 0
	context.title = _("Sign in")

	context.tm_app_name = context.get("app_name") or "TaxMate"
	context.tm_logo = _brand_logo(context.get("logo"))
	context.tm_support_email = _support_email()
	context.tm_pricing_url = "/plans"
	context.tm_terms_url = "/terms"
	context.tm_privacy_url = "/privacy"

	context.tm_redirect_qs = _redirect_query()
	context.tm_year = frappe.utils.now_datetime().year

	context.tm_lang = frappe.local.lang or "en"
	# ar-AE and ar both count as Arabic.
	context.tm_is_rtl = context.tm_lang.split("-")[0] in ("ar", "he", "fa", "ps")

	# Left panel copy. Kept here so it is translated and easy to edit; the
	# figures in the sample card are illustrative and labelled as such.
	context.tm_hero_title = _("UAE tax, handled.")
	context.tm_hero_sub = _("Invoicing, VAT 201 and e-invoicing in one place, for businesses filing in the UAE.")
	context.tm_features = [
		{"title": _("E-invoicing to the FTA"), "body": _("sent through your accredited provider, with retries")},
		{"title": _("Every deadline tracked"), "body": _("VAT, Corporate Tax, ESR and UBO, with reminders")},
		{"title": _("Books that agree"), "body": _("bank, stock and party ledgers checked daily")},
	]
	context.tm_card = {
		"title": _("VAT 201 · Q3"),
		"chip": _("Example"),
		"rows": [
			{"k": _("Standard rated · Dubai"), "v": "118,400.00"},
			{"k": _("Output VAT"), "v": "9,212.50"},
			{"k": _("Recoverable input VAT"), "v": "4,839.00"},
		],
		"net_label": _("Payable to the FTA"),
		"net": _("AED {0}").format("4,373.50"),
		"check": _("Matches the ledger"),
	}
	context.tm_trust = [_("Arabic and English"), _("Amounts in AED")]

	# Frappe has no per-login "remember me": how long a session lasts is
	# System Settings > Session Expiry, for everyone. So the page does not
	# offer a checkbox it cannot honour.
	context.tm_login_with_email_link = cint(context.get("login_with_email_link"))
	context.tm_disable_user_pass_login = cint(context.get("disable_user_pass_login"))

	return context


def _brand_logo(frappe_logo) -> str:
	logo = (frappe_logo or "").strip()
	if not logo or logo == _ERPNEXT_DEFAULT_LOGO or logo.endswith("/erpnext-logo.svg"):
		return TAXMATE_LOGO
	return logo


def _safe_redirect_path(value) -> str:
	"""Keep language-switcher ``redirect-to`` as a same-origin path only."""
	if not value:
		return ""
	path = unquote(str(value).strip())
	# Browsers strip C0 controls before parsing, so /%09//host becomes //host.
	if any(ord(c) < 32 or ord(c) == 127 for c in path):
		return ""
	if not path.startswith("/") or path.startswith("//") or path.startswith("/\\"):
		return ""
	if "\\" in path or "://" in path:
		return ""
	return path


def _redirect_query() -> str:
	raw = frappe.form_dict.get("redirect-to")
	if not raw and getattr(frappe.local, "request", None):
		raw = frappe.local.request.args.get("redirect-to")
	path = _safe_redirect_path(raw)
	if not path:
		return ""
	return "&redirect-to=" + quote(path, safe="/")


def _support_email() -> str:
	"""The address shown on the help link. Blank hides the link."""
	for doctype, fieldname in (
		("Contact Us Settings", "email_id"),
		("TaxMate Settings", "support_email"),
	):
		if not frappe.db.exists("DocType", doctype):
			continue
		if not frappe.get_meta(doctype).has_field(fieldname):
			continue
		value = frappe.db.get_single_value(doctype, fieldname)
		if value:
			return str(value).strip()
	return ""
