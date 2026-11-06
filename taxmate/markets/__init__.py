"""Gulf-market profiles for dashboards. UAE first; other GCC markets plug in here."""

from __future__ import annotations

from typing import Any

import frappe

from taxmate.markets import uae

_BY_CODE = {
	"AE": uae.MARKET,
}
_BY_COUNTRY: dict[str, dict[str, Any]] = {}
for _m in _BY_CODE.values():
	for _name in _m.get("countries") or ():
		_BY_COUNTRY[_name.casefold()] = _m


def get_market(company: str | None = None) -> dict[str, Any]:
	"""Resolved market profile for a Company (country → code). Defaults to UAE."""
	country = None
	if company:
		country = frappe.get_cached_value("Company", company, "country")
	profile = _BY_COUNTRY.get((country or "").casefold()) if country else None
	if not profile:
		profile = uae.MARKET
	return {
		"code": profile["code"],
		"name": profile["name"],
		"currency": profile["currency"],
		"filings": [{"kind": f["kind"], "label_key": f["label_key"]} for f in profile["filings"]],
	}
