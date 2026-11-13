"""Public /plans. Guests see the rate card; subscribe after sign-in."""

from __future__ import annotations

from frappe import _

from taxmate.website_pages import apply_chrome, list_public_plans, trial_length

no_cache = 1
sitemap = 1


def get_context(context):
	apply_chrome(context, _("Plans"), "plans")
	days = trial_length()
	context.tm_trial_days = days
	context.tm_lede = _(
		"{0}-day trial. Then pick a plan. Prices are AED, excluding VAT."
	).format(days)
	context.tm_plans = list_public_plans()
	context.tm_cta = _("Sign in to subscribe")
	context.tm_faqs = [
		{
			"q": _("What happens when the trial ends?"),
			"a": _(
				"Sales, Purchase, Stock and VAT pause until the owner subscribes. "
				"The data stays. Staff are not billed separately."
			),
		},
		{
			"q": _("Do I need a card for the trial?"),
			"a": _("No. You pay when you pick a plan."),
		},
		{
			"q": _("Monthly or annual?"),
			"a": _(
				"Annual is one payment and costs about ten months of the monthly price. "
				"Prices are AED, excluding VAT."
			),
		},
	]
	return context
