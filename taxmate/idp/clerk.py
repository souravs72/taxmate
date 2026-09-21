"""Clerk-facing Invoice OCR: drafts only, existing masters, hidden admin chrome."""

from __future__ import annotations

import json
from typing import Any

import frappe
from frappe import _

EXTRACT_PROMPT = "Extract this supplier bill into a draft Purchase Invoice."

IDP_ADMIN_SEARCH_DOCTYPES = frozenset(
	{
		"IDP Conversation",
		"IDP Message",
		"IDP Settings",
		"IDP Document Log",
		"IDP Batch Job",
		"IDP Extraction Template",
		"IDP Extraction Correction",
		"IDP Prompt Template",
		"IDP Prompt Library",
		"IDP Skill",
		"IDP Tool Configuration",
		"IDP Plugin Configuration",
		"IDP Tool Call Log",
	}
)


def is_idp_manager() -> bool:
	if frappe.session.user in (None, "Guest"):
		return False
	if frappe.session.user == "Administrator":
		return True
	return "System Manager" in frappe.get_roles()


@frappe.whitelist()
def get_settings() -> dict:
	"""IDP settings plus TaxMate clerk flags for the chat SPA."""
	from idp.api.settings import get_settings as original

	data = original()
	manager = is_idp_manager()
	data["is_manager"] = manager
	# Product chat for every desk user. Settings gear still uses is_manager.
	data["clerk_mode"] = True
	data["extract_prompt"] = EXTRACT_PROMPT
	data["enable_cost_footer"] = 0
	data["enable_bulk_actions"] = 0
	data["enable_sidebar_search"] = 0
	data["enable_suggested_prompts"] = 0
	if not manager:
		data["supported_doctypes"] = ["Purchase Invoice"]
		features = dict(data.get("features") or {})
		features["write_operations"] = False
		features["auto_create_masters"] = False
		data["features"] = features
	return data


@frappe.whitelist()
def confirm_card(
	conversation_id: str,
	message_id: str,
	action: str,
	edited_payload: str | dict | None = None,
) -> dict:
	"""Draft-only confirm: no Submit, existing Items, default UAE input VAT."""
	from idp.api.conversation import _parse_json_arg
	from idp.api.conversation import confirm_card as original

	if (action or "") == "submit":
		frappe.throw(_("Invoice OCR only creates drafts. Open the Purchase Invoice in TaxMate to submit."))

	edited = _parse_json_arg(edited_payload, None)
	if edited is None:
		edited = {}
	if not isinstance(edited, dict):
		edited = {}

	card = _card_from_message(message_id)
	if card:
		_fill_tax_account_mappings(card, edited)
		_reject_new_items(card, edited)

	return original(
		conversation_id=conversation_id,
		message_id=message_id,
		action=action,
		edited_payload=edited,
	)


def default_purchase_vat_account(company: str | None) -> str | None:
	"""First account head on a UAE VAT 5% purchase tax template for *company*."""
	if not company:
		return None
	if not frappe.db.exists("DocType", "Purchase Taxes and Charges Template"):
		return None
	names = frappe.get_all(
		"Purchase Taxes and Charges Template",
		filters={"company": company},
		pluck="name",
	)
	preferred = [n for n in names if "VAT 5%" in (n or "")]
	for name in preferred + [n for n in names if n not in preferred]:
		rows = frappe.get_all(
			"Purchase Taxes and Charges",
			filters={"parent": name},
			fields=["account_head"],
			order_by="idx",
			limit=1,
		)
		account = (rows[0].account_head if rows else "") or ""
		if account and frappe.db.exists("Account", account):
			return account
	return None


def _card_from_message(message_id: str) -> dict[str, Any] | None:
	if not message_id or not frappe.db.exists("IDP Message", message_id):
		return None
	raw = frappe.db.get_value("IDP Message", message_id, "rendered_card_payload")
	if not raw:
		return None
	try:
		card = json.loads(raw) if isinstance(raw, str) else raw
	except Exception:
		return None
	return card if isinstance(card, dict) else None


def _fill_tax_account_mappings(card: dict[str, Any], edited: dict[str, Any]) -> None:
	company = (card.get("company") or "").strip() or frappe.defaults.get_user_default("Company")
	account = default_purchase_vat_account(company)
	if not account:
		return
	mappings = dict(edited.get("account_mappings") or {})
	rows = ((card.get("taxes") or {}) or {}).get("rows") or []
	for row in rows:
		if not isinstance(row, dict):
			continue
		if (row.get("erpnext_account") or "").strip():
			continue
		idx = row.get("row_index")
		if idx is None:
			continue
		if mappings.get(str(idx)) or mappings.get(idx):
			continue
		mappings[str(idx)] = account
	if mappings:
		edited["account_mappings"] = mappings


def _reject_new_items(card: dict[str, Any], edited: dict[str, Any]) -> None:
	item_map = edited.get("item_mappings") or {}
	if not isinstance(item_map, dict):
		item_map = {}
	missing: list[str] = []
	rows = ((card.get("items") or {}) or {}).get("rows") or []
	for row in rows:
		if not isinstance(row, dict):
			continue
		idx = row.get("index")
		mapped = ""
		if idx is not None:
			mapped = (item_map.get(str(idx)) or item_map.get(idx) or "") or ""
		mapped = (mapped or row.get("erpnext_item") or "").strip()
		if mapped:
			continue
		extracted = row.get("extracted") or {}
		label = (
			extracted.get("name")
			or extracted.get("code")
			or extracted.get("item_code")
			or _("line {0}").format(idx if idx is not None else "?")
		)
		missing.append(str(label))
	if missing:
		frappe.throw(
			_(
				"Pick an existing Item for every line before creating the draft. "
				"Invoice OCR will not create new Items. Unmapped: {0}"
			).format(", ".join(missing[:8]))
		)
