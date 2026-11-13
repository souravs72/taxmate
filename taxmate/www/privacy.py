"""Public /privacy. Guest-readable. No Desk links."""

from __future__ import annotations

from frappe import _

from taxmate.website_pages import apply_chrome

sitemap = 1


def get_context(context):
	apply_chrome(context, _("Privacy"), "privacy")
	context.tm_lede = _("What this site stores about you, and who can see it.")
	support = context.tm_support_email
	if support:
		delete_copy = _(
			"Email {0} if you need a copy of your data or want it deleted."
		).format(support)
	else:
		delete_copy = _(
			"Ask the site owner if you need a copy of your data or want it deleted."
		)
	context.tm_sections = [
		{
			"h": _("What we collect"),
			"p": _(
				"Your name, email, company, invoices, ledgers, and the IP address used at sign-in."
			),
		},
		{
			"h": _("What it's for"),
			"p": _(
				"To run TaxMate for your company: books, VAT, e-invoicing, and billing."
			),
		},
		{
			"h": _("Who sees it"),
			"p": _(
				"Users in your company. Advirexa staff, when you ask for support. "
				"Your accredited e-invoicing provider, when you send an e-invoice."
			),
		},
		{
			"h": _("Cookies"),
			"p": _("A session cookie keeps you signed in."),
		},
		{
			"h": _("How long"),
			"p": _("For as long as the company has an account."),
		},
		{
			"h": _("Copies and deletion"),
			"p": delete_copy,
		},
		{
			"h": _("Where it lives"),
			"p": _("On this Frappe site. We do not sell it."),
		},
	]
	return context
