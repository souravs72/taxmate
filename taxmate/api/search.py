"""AwesomeBar-style search for the TaxMate SPA only.

Importers: frontend GlobalSearch via METHOD.awesomeSearch / catalog action
awesome_search. Whitelist: taxmate.api.search.awesome.
Schema: {query, groups:[{title, results:[{type, doctype?, name?, title, description?, route}]}]}.
Routes are SPA paths under /taxmate (e.g. /orders/…); never Desk /app/….
User: "The frontend searchbar should navigate to /taxmate endpoints only …
similar to awesomebar. But not on desk endpoints"
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import cint, cstr

from taxmate.api.resource import is_allowed_doctype, require_login
from taxmate.search import GLOBAL_SEARCH_DOCTYPES

# Only doctypes the React app owns. No Desk fallback.
_SPA_DOC_ROUTES: dict[str, str] = {
	"Customer": "/customers/{name}",
	"Supplier": "/suppliers/{name}",
	"Sales Order": "/orders/{name}",
	"Delivery Note": "/delivery-notes/{name}",
	"Sales Invoice": "/invoices/{name}",
	"Payment Entry": "/payments/{name}",
	"Item": "/catalogue/items/{name}",
}

_SPA_LIST_ROUTES: dict[str, str] = {
	"Customer": "/customers",
	"Supplier": "/suppliers",
	"Sales Order": "/orders",
	"Delivery Note": "/delivery-notes",
	"Sales Invoice": "/invoices",
	"Payment Entry": "/payments",
	"Item": "/catalogue/items",
}

# In-app pages (AwesomeBar “pages” feel) — SPA routes only.
_NAV_PAGES: tuple[dict[str, str], ...] = (
	{"label": "Dashboard", "route": "/", "keywords": "home overview kpi books"},
	{"label": "Sales Orders", "route": "/orders", "keywords": "home dashboard sales order so"},
	{"label": "Delivery Notes", "route": "/delivery-notes", "keywords": "dn delivery note despatch"},
	{"label": "Customers", "route": "/customers", "keywords": "customer party"},
	{"label": "Suppliers", "route": "/suppliers", "keywords": "supplier vendor purchase party"},
	{"label": "Invoices", "route": "/invoices", "keywords": "sales invoice bill"},
	{"label": "Payments", "route": "/payments", "keywords": "payment receipt"},
	{"label": "Receivables", "route": "/receivables", "keywords": "ar outstanding"},
	{"label": "Items", "route": "/catalogue/items", "keywords": "item product catalogue"},
	{"label": "E-Invoice Log", "route": "/e-invoice-log", "keywords": "einvoice peppol asp"},
	{"label": "Tax Settings", "route": "/tax-settings", "keywords": "asp uae tax settings"},
)

_SPA_DOCTYPES = frozenset(_SPA_DOC_ROUTES)


def _doc_route(doctype: str, name: str) -> str | None:
	template = _SPA_DOC_ROUTES.get(doctype)
	if not template:
		return None
	return template.format(name=quote(name, safe=""))


def _list_route(doctype: str) -> str | None:
	return _SPA_LIST_ROUTES.get(doctype)


def _fuzzy_score(query: str, text: str) -> float:
	"""Simple subsequence score in [0, 1]. Higher is better."""
	q = cstr(query).lower().strip()
	t = cstr(text).lower()
	if not q or not t:
		return 0.0
	if q == t:
		return 1.0
	if t.startswith(q):
		return 0.95
	if q in t:
		return 0.8
	ti = 0
	matched = 0
	for ch in q:
		found = t.find(ch, ti)
		if found < 0:
			return 0.0
		matched += 1
		ti = found + 1
	return 0.4 * (matched / max(len(t), 1))


def _nav_results(text: str, limit: int) -> list[dict[str, Any]]:
	out: list[dict[str, Any]] = []
	for page in _NAV_PAGES:
		hay = f"{page['label']} {page['keywords']}"
		score = _fuzzy_score(text, hay)
		if score <= 0:
			continue
		out.append(
			{
				"type": "page",
				"title": page["label"],
				"description": _("Go to {0}").format(page["label"]),
				"route": page["route"],
				"score": score,
			}
		)
	out.sort(key=lambda r: r["score"], reverse=True)
	return out[:limit]


def _doctype_list_results(text: str, limit: int) -> list[dict[str, Any]]:
	"""Match DocType titles like AwesomeBar ‘List Customer’ — SPA lists only."""
	out: list[dict[str, Any]] = []
	can_read = set(frappe.get_user().get_can_read())
	for doctype in _SPA_DOCTYPES:
		if doctype not in can_read or not is_allowed_doctype(doctype):
			continue
		route = _list_route(doctype)
		if not route:
			continue
		score = max(_fuzzy_score(text, doctype), _fuzzy_score(text, f"list {doctype}"))
		if score < 0.4:
			continue
		out.append(
			{
				"type": "list",
				"doctype": doctype,
				"title": _("List {0}").format(doctype),
				"description": doctype,
				"route": route,
				"score": score,
			}
		)
	out.sort(key=lambda r: r["score"], reverse=True)
	return out[:limit]


def _global_results(text: str, limit: int) -> list[dict[str, Any]]:
	from frappe.utils.global_search import search as frappe_global_search

	allowed = {dt for dt in GLOBAL_SEARCH_DOCTYPES if dt in _SPA_DOCTYPES and is_allowed_doctype(dt)}
	if not allowed:
		return []

	raw = frappe_global_search(text=text, start=0, limit=limit, doctype="")
	out: list[dict[str, Any]] = []
	seen: set[tuple[str, str]] = set()
	for row in raw or []:
		doctype = row.get("doctype")
		name = row.get("name")
		if not doctype or not name or doctype not in allowed:
			continue
		route = _doc_route(doctype, name)
		if not route:
			continue
		key = (doctype, name)
		if key in seen:
			continue
		seen.add(key)
		title = cstr(row.get("title") or name)
		content = cstr(row.get("content") or "")
		description = re.sub(r"<[^>]+>", " ", content)
		description = re.sub(r"\s+", " ", description).strip()
		if len(description) > 120:
			description = description[:117] + "…"
		out.append(
			{
				"type": "document",
				"doctype": doctype,
				"name": name,
				"title": title,
				"description": description or doctype,
				"route": route,
				"score": float(row.get("rank") or 0),
			}
		)
		if len(out) >= limit:
			break
	return out


def _exact_name_hits(text: str, limit: int) -> list[dict[str, Any]]:
	"""If the query looks like a document name, try exact matches on SPA doctypes."""
	if " " in text.strip() and not re.search(r"-\d", text):
		return []
	out: list[dict[str, Any]] = []
	for doctype in _SPA_DOCTYPES:
		if doctype not in _SPA_DOCTYPES:
			continue
		if not is_allowed_doctype(doctype) or not frappe.has_permission(doctype, "read"):
			continue
		if not frappe.db.exists(doctype, text):
			continue
		route = _doc_route(doctype, text)
		if not route:
			continue
		out.append(
			{
				"type": "document",
				"doctype": doctype,
				"name": text,
				"title": text,
				"description": doctype,
				"route": route,
				"score": 1.0,
			}
		)
		if len(out) >= limit:
			break
	return out


@frappe.whitelist()
def awesome(text: str = "", limit: int = 20) -> dict[str, Any]:
	"""Return grouped AwesomeBar-style hits for the SPA search field (SPA routes only)."""
	require_login()
	text = cstr(text).strip()
	limit = max(1, min(cint(limit) or 20, 50))
	if not text:
		return {"query": text, "groups": []}

	pages = _nav_results(text, limit=8)
	lists = _doctype_list_results(text, limit=8)
	exact = _exact_name_hits(text, limit=5)
	documents = _global_results(text, limit=limit)

	doc_keys = {(d["doctype"], d["name"]) for d in exact}
	documents = exact + [d for d in documents if (d["doctype"], d["name"]) not in doc_keys]

	groups: list[dict[str, Any]] = []
	if pages:
		groups.append({"title": _("Pages"), "results": pages})
	if lists:
		groups.append({"title": _("Lists"), "results": lists})
	if documents:
		groups.append({"title": _("Documents"), "results": documents[:limit]})

	return {"query": text, "groups": groups}
