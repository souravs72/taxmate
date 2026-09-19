"""Flag related-party Sales Invoices from the UAE Related Party register."""

from __future__ import annotations

from taxmate.uae_corporate_tax.utils.corporate_tax import party_is_related


def validate(doc, method=None):
	if not doc.meta.has_field("uae_related_party"):
		return
	related = bool(doc.company and doc.get("customer") and party_is_related(doc.company, "Customer", doc.customer))
	doc.uae_related_party = 1 if related else 0
