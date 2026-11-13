"""Public /terms. Guest-readable. No Desk links."""

from __future__ import annotations

from frappe import _

from taxmate.website_pages import apply_chrome, trial_length

sitemap = 1


def get_context(context):
	apply_chrome(context, _("Terms of use"), "terms")
	context.tm_lede = _("How the product is sold and used on this site.")
	days = trial_length()
	support = context.tm_support_email
	if support:
		end_copy = _(
			"The owner can stop paying. Advirexa can close an account that breaks these "
			"terms. Email {0} if you need a copy of your data before you leave."
		).format(support)
	else:
		end_copy = _(
			"The owner can stop paying. Advirexa can close an account that breaks these "
			"terms. Ask the site owner if you need a copy of your data before you leave."
		)
	context.tm_sections = [
		{
			"h": _("Who we are"),
			"p": _(
				"TaxMate is accounting software for UAE VAT. Advirexa sells it. "
				"It runs on this site."
			),
		},
		{
			"h": _("Your account"),
			"p": _(
				"You sign in with a work email. The company on this site is the subscriber. "
				"The owner pays."
			),
		},
		{
			"h": _("Trial"),
			"p": _(
				"A new company gets a {0}-day trial, without a card. When the trial ends, "
				"Sales, Purchase, Stock and VAT pause until the owner subscribes. "
				"Your data stays on the site."
			).format(days),
		},
		{
			"h": _("Plans and payment"),
			"p": _(
				"Prices are on the Plans page, in AED, excluding VAT. Monthly is billed each "
				"month. Annual is one payment. Checkout uses the payment gateway set in "
				"TaxMate Settings. Only the company owner can subscribe."
			),
		},
		{
			"h": _("Your books and the FTA"),
			"p": _(
				"You are responsible for what you file with the FTA. TaxMate records invoices, "
				"VAT 201 and e-invoices. If you send an e-invoice, it goes to your accredited "
				"provider, then to the FTA. Failed sends retry."
			),
		},
		{
			"h": _("Acceptable use"),
			"p": _(
				"Do not use the site to break the law, read another company's books, "
				"or overload the servers."
			),
		},
		{
			"h": _("Availability"),
			"p": _(
				"The site will have downtime and maintenance. Advirexa is not liable for "
				"lost profit from that downtime."
			),
		},
		{
			"h": _("Ending the service"),
			"p": end_copy,
		},
		{
			"h": _("Changes"),
			"p": _("We may change these terms. The date at the top is the current version."),
		},
		{
			"h": _("Law"),
			"p": _(
				"United Arab Emirates law applies. If we cannot settle a dispute, "
				"the courts of the UAE hear it."
			),
		},
	]
	return context
