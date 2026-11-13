"""Document event hooks for billing."""

from __future__ import annotations


def company_after_insert(doc, method=None):
	from taxmate.billing.trial import ensure_company_trial

	ensure_company_trial(doc.name)
