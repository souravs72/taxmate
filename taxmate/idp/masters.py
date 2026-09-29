"""Consent-based related masters for Scan create.

Unattended inventing stays off. The clerk confirms each proposal, then
TaxMate inserts Supplier / Customer / Item (and Address) before the draft.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from taxmate.uae.constants import UAE_EMIRATES

# Links the scan may create after the clerk confirms. Everything else blocks.
CREATABLE: frozenset[str] = frozenset({"Supplier", "Customer", "Item"})
EMIRATES: tuple[str, ...] = tuple(UAE_EMIRATES)

_PARTY_LABEL: dict[str, str] = {
	"supplier": "idp.field.supplier",
	"customer": "f.customer",
	"supplier_name": "idp.field.supplier",
	"customer_name": "f.customer",
}

_PARTY_LINK: dict[str, str] = {
	"Supplier": "supplier",
	"Customer": "customer",
}

_FIELD_TO_DOCTYPE: dict[str, str] = {
	"supplier": "Supplier",
	"customer": "Customer",
	"item_code": "Item",
	"item": "Item",
}

# Target doctype → party Link (mirrors taxmate.idp.desk.PARTY_FIELD for creatable parties).
_PARTY_BY_DOCTYPE: dict[str, str] = {
	"Sales Invoice": "customer",
	"Purchase Invoice": "supplier",
	"Sales Order": "customer",
	"Purchase Order": "supplier",
	"Delivery Note": "customer",
	"Purchase Receipt": "supplier",
	"Supplier Quotation": "supplier",
}

_SUPPLIER_ALIASES: tuple[str, ...] = (
	"supplier",
	"supplier_name",
	"vendor",
	"seller",
	"seller_name",
	"bill_from",
	"sold_by",
	"from",
	"supplier_address_title",
	# Invoice PDFs often print the issuer only as the bank beneficiary.
	"account_name",
	"beneficiary",
	"beneficiary_name",
	"company_name",
	"remitter",
)
_CUSTOMER_ALIASES: tuple[str, ...] = (
	"customer",
	"customer_name",
	"buyer",
	"client",
	"bill_to",
	"sold_to",
	"ship_to",
	"customer_address_title",
)
_ADDRESS_ALIASES: tuple[str, ...] = (
	"billing_address",
	"address",
	"supplier_address",
	"customer_address",
	"bill_address",
	"address_line1",
)
_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
	"bill_no": ("invoice_number", "invoice_no", "bill_number", "inv_no", "bill_no"),
	"posting_date": ("date", "invoice_date", "bill_date", "posting_date"),
	"transaction_date": ("date", "order_date", "po_date", "transaction_date"),
	"grand_total": ("total", "total_amount", "grand_total", "amount_due", "total_due"),
	"net_total": ("subtotal", "sub_total", "net_total", "net_amount", "total_due"),
	"currency": ("currency",),
	"tax_id": ("tax_id", "trn", "vat_number", "supplier_trn", "customer_trn", "gstin"),
}


def normalize_extract(extracted: dict[str, Any], *, promote_items: bool = True) -> None:
	"""Promote OCR/LLM aliases onto ERPNext Links before match and proposals.

	IDP often leaves bill_to / billing_address instead of supplier or customer.
	Without this pass, missing_masters stays empty and Scan never proposes create.

	Call with promote_items=False before item-name lookup so existing catalog
	rows still match; then call promote_unresolved_items afterward.
	"""
	if not extracted.get("success"):
		return
	data = extracted.get("extracted_data")
	if not isinstance(data, dict):
		return
	header = data.get("header")
	if not isinstance(header, dict):
		return
	doctype = str(data.get("doctype") or "")
	_promote_header_scalars(header, doctype)
	_promote_party(header, doctype)
	_promote_address(header)
	_promote_totals(header)
	_scrub_contact_noise(header)
	_ensure_line_from_total(data)
	if promote_items:
		items = data.get("items")
		if isinstance(items, list):
			promote_unresolved_items(items)


def promote_unresolved_items(items: list[Any]) -> None:
	"""After name lookup, copy printed names onto item_code so Link checks can propose create."""
	_promote_item_codes(items)


def _promote_header_scalars(header: dict[str, Any], doctype: str) -> None:
	for field, aliases in _HEADER_ALIASES.items():
		if field in ("posting_date", "transaction_date"):
			# Prefer the date field the target DocType uses.
			if doctype.startswith("Purchase Order") or doctype in (
				"Sales Order",
				"Quotation",
				"Supplier Quotation",
			):
				if field == "posting_date":
					continue
			elif field == "transaction_date":
				continue
		if str(header.get(field) or "").strip():
			continue
		value = _alias_value(header, aliases)
		if value:
			header[field] = value


def _promote_party(header: dict[str, Any], doctype: str) -> None:
	link = _PARTY_BY_DOCTYPE.get(doctype)
	if not link:
		return
	if str(header.get(link) or "").strip():
		return
	primary = _SUPPLIER_ALIASES if link == "supplier" else _CUSTOMER_ALIASES
	value = _alias_value(header, primary)
	if value:
		header[link] = value


def _promote_address(header: dict[str, Any]) -> None:
	if str(header.get("address_line1") or "").strip():
		return
	raw = _alias_value(header, _ADDRESS_ALIASES)
	if not raw:
		return
	line1, city, state = _split_address(raw)
	header["address_line1"] = line1 or raw
	if city and not header.get("city"):
		header["city"] = city
	if state and not header.get("state") and not header.get("vat_emirate"):
		header["state"] = state
		header["vat_emirate"] = state


def _promote_item_codes(items: list[Any]) -> None:
	"""When OCR only printed a name, put a short code on item_code and keep the label as name."""
	for row in items:
		if not isinstance(row, dict):
			continue
		label = str(row.get("item_name") or row.get("description") or "").strip()
		existing = str(row.get("item_code") or "").strip()
		if existing and not _looks_like_description(existing):
			if not row.get("item_name") and label:
				row["item_name"] = label
			continue
		source = existing or label
		if not source:
			continue
		clean_name = _clean_item_label(source)
		row["item_name"] = clean_name or source
		row["item_code"] = _slug_code(clean_name or source)


def _alias_value(header: dict[str, Any], aliases: tuple[str, ...]) -> str:
	lowered = {str(k).strip().lower().replace(" ", "_"): v for k, v in header.items()}
	for alias in aliases:
		key = alias.lower().replace(" ", "_")
		value = lowered.get(key)
		if value in (None, ""):
			continue
		text = str(value).strip()
		if text:
			return text
	return ""


def _split_address(raw: str) -> tuple[str, str, str]:
	"""Best-effort line1 / city / emirate from a single billing_address string."""
	parts = [p.strip() for p in re.split(r",|\n", raw) if p and p.strip()]
	if not parts:
		return raw.strip(), "", ""
	state = ""
	city = ""
	for part in reversed(parts):
		token = part.strip()
		lower = token.lower().replace(".", "")
		if lower in {"uae", "united arab emirates", "u a e"}:
			continue
		for emirate in EMIRATES:
			compact = emirate.lower().replace(" ", "")
			if emirate.lower() in lower or lower in emirate.lower() or compact in lower.replace(" ", ""):
				state = emirate
				break
		if state:
			break
	if state:
		compact_state = state.lower().replace(" ", "")
		parts = [
			p
			for p in parts
			if state.lower() not in p.lower()
			and compact_state not in p.lower().replace(" ", "")
			and p.lower().replace(".", "") not in {"uae", "united arab emirates"}
		]
	if parts:
		# Last remaining segment often the city / area.
		city_candidate = parts[-1]
		if len(parts) > 1 and len(city_candidate) < 40:
			city = city_candidate
			parts = parts[:-1]
	line1 = ", ".join(parts) if parts else raw.strip()
	return line1, city, state


def normalize_missing(rows: Any) -> list[dict[str, str]]:
	"""Turn IDP missing_masters into {doctype, name, field} rows."""
	out: list[dict[str, str]] = []
	seen: set[tuple[str, str, str]] = set()
	for row in rows or []:
		if isinstance(row, str):
			token = row.strip()
			if not token:
				continue
			if token in CREATABLE or token in {"Account", "Cost Center", "Company", "UOM", "Item Group"}:
				doctype, field, name = token, "", ""
			elif token in _FIELD_TO_DOCTYPE:
				doctype = _FIELD_TO_DOCTYPE[token]
				field, name = token, ""
			else:
				doctype = token
				field, name = "", token
		elif isinstance(row, dict):
			doctype = str(row.get("doctype") or "").strip()
			name = str(row.get("name") or "").strip()
			field = str(row.get("field") or "").strip()
			if not doctype and field:
				doctype = _FIELD_TO_DOCTYPE.get(field, "")
			if not doctype:
				continue
		else:
			continue
		key = (doctype, name, field)
		if key in seen:
			continue
		seen.add(key)
		out.append({"doctype": doctype, "name": name, "field": field})
	return out


def split_missing(rows: Any) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
	"""Creatable proposals vs hard blockers."""
	creatable: list[dict[str, str]] = []
	blocked: list[dict[str, str]] = []
	for row in normalize_missing(rows):
		if row["doctype"] in CREATABLE:
			creatable.append(row)
		else:
			blocked.append(row)
	return creatable, blocked


def party_by_trn(doctype: str, trn: str | None) -> str | None:
	"""Match Supplier or Customer by normalized tax_id."""
	if doctype not in ("Supplier", "Customer"):
		return None
	from taxmate.uae.validation import normalize_trn

	cleaned = normalize_trn(trn)
	if not cleaned:
		return None
	import frappe

	# Static SQL per doctype — table name is never user input.
	query = {
		"Supplier": "select name from `tabSupplier` where replace(ifnull(tax_id, ''), ' ', '') = %s limit 1",
		"Customer": "select name from `tabCustomer` where replace(ifnull(tax_id, ''), ' ', '') = %s limit 1",
	}[doctype]
	row = frappe.db.sql(query, cleaned)
	return row[0][0] if row else None


def bind_parties_by_trn(extracted: dict[str, Any]) -> None:
	"""Rewrite header party Links when a TRN on the extract matches an existing party."""
	if not extracted.get("success"):
		return
	data = extracted.get("extracted_data") or {}
	header = data.get("header")
	if not isinstance(header, dict):
		return
	trn = _header_trn(header)
	for doctype, field in _PARTY_LINK.items():
		raw = str(header.get(field) or "").strip()
		if not raw:
			continue
		import frappe

		if frappe.db.exists(doctype, raw):
			continue
		matched = party_by_trn(doctype, trn) or party_by_trn(doctype, raw)
		if matched:
			header[field] = matched


def _header_trn(header: dict[str, Any]) -> str:
	for key in ("tax_id", "supplier_trn", "customer_trn", "trn", "vat_number", "gstin"):
		value = str(header.get(key) or "").strip()
		if value:
			return value
	return ""


def build_proposals(extracted: dict[str, Any]) -> list[dict[str, Any]]:
	"""One consent card per missing creatable master. Prefills what the file carried."""
	validation = extracted.get("validation") or {}
	creatable, _blocked = split_missing(validation.get("missing_masters"))
	if not creatable:
		return []
	data = extracted.get("extracted_data") or {}
	header = dict(data.get("header") or {})
	items = [row for row in (data.get("items") or []) if isinstance(row, dict)]
	proposals: list[dict[str, Any]] = []
	seen: set[str] = set()
	for row in creatable:
		doctype = row["doctype"]
		if doctype in ("Supplier", "Customer"):
			proposal = _party_proposal(doctype, row, header)
		elif doctype == "Item":
			proposal = _item_proposal(row, items)
		else:
			continue
		if not proposal or proposal["key"] in seen:
			continue
		seen.add(proposal["key"])
		proposals.append(proposal)
	return proposals


def _party_proposal(doctype: str, missing: dict[str, str], header: dict[str, Any]) -> dict[str, Any] | None:
	link_field = missing.get("field") or _PARTY_LINK[doctype]
	raw_name = str(missing.get("name") or header.get(link_field) or "").strip()
	if not raw_name:
		return None
	name_field = "supplier_name" if doctype == "Supplier" else "customer_name"
	type_field = "supplier_type" if doctype == "Supplier" else "customer_type"
	trn = _header_trn(header)
	source = {
		name_field: raw_name,
		type_field: "Company",
		"tax_id": trn,
		"address_line1": str(
			header.get("address_line1") or header.get("supplier_address") or header.get("address") or ""
		).strip(),
		"city": str(header.get("city") or "").strip(),
		"state": _emirate(header),
		"email_id": _safe_email(header.get("email_id") or header.get("email")),
		"phone": str(header.get("phone") or header.get("mobile_no") or "").strip(),
	}
	required = [
		_field(name_field, _PARTY_LABEL.get(name_field, f"idp.field.{name_field}"), source[name_field]),
		_field(type_field, "idp.field.partyType", source[type_field], options=["Company", "Individual"]),
		_field("address_line1", "idp.field.addressLine", source["address_line1"]),
		_field("city", "idp.field.city", source["city"]),
		_field("state", "idp.field.emirate", source["state"], options=list(EMIRATES)),
	]
	optional = [
		_field("tax_id", "f.customerTrn" if doctype == "Customer" else "idp.field.trn", source["tax_id"]),
		_field("email_id", "idp.field.email", source["email_id"]),
		_field("phone", "idp.field.phone", source["phone"]),
	]
	return {
		"key": f"{doctype.lower()}:{raw_name}",
		"doctype": doctype,
		"link_field": link_field,
		"title": raw_name,
		"source_fields": source,
		"required_fields": required,
		"optional_fields": optional,
		"consent_label_key": "idp.propose.supplier" if doctype == "Supplier" else "idp.propose.customer",
		"confirmed": False,
	}


def _item_proposal(missing: dict[str, str], items: list[dict[str, Any]]) -> dict[str, Any] | None:
	raw = str(missing.get("name") or "").strip()
	row = _item_row_for(raw, items)
	raw_label = str((row or {}).get("item_name") or (row or {}).get("description") or raw).strip()
	label = _clean_item_label(raw_label) or raw_label
	if not label:
		return None
	existing = str((row or {}).get("item_code") or "").strip()
	code = existing if existing and not _looks_like_description(existing) else _slug_code(label)
	uom = str((row or {}).get("uom") or (row or {}).get("stock_uom") or "Nos").strip() or "Nos"
	source = {
		"item_code": code,
		"item_name": label,
		"item_group": "",
		"stock_uom": uom,
	}
	required = [
		_field("item_code", "idp.field.itemCode", source["item_code"]),
		_field("item_name", "idp.field.itemName", source["item_name"]),
		_field("stock_uom", "idp.field.uom", source["stock_uom"]),
	]
	optional = [_field("item_group", "idp.field.itemGroup", source["item_group"])]
	return {
		"key": f"item:{label}",
		"doctype": "Item",
		"link_field": "item_code",
		"link_index": items.index(row) if row in items else None,
		"title": label,
		"source_fields": source,
		"required_fields": required,
		"optional_fields": optional,
		"consent_label_key": "idp.propose.item",
		"confirmed": False,
	}


def _item_row_for(raw: str, items: list[dict[str, Any]]) -> dict[str, Any] | None:
	needle = raw.lower()
	for row in items:
		for key in ("item_code", "item_name", "description"):
			if str(row.get(key) or "").strip().lower() == needle:
				return row
	for row in items:
		if not row.get("item_code"):
			return row
	return items[0] if items else None


def _emirate(header: dict[str, Any]) -> str:
	for key in ("vat_emirate", "emirate", "state"):
		value = str(header.get(key) or "").strip()
		if value in EMIRATES:
			return value
	return ""


def _field(field: str, label_key: str, value: str, options: list[str] | None = None) -> dict[str, Any]:
	row: dict[str, Any] = {"field": field, "label_key": label_key, "value": value or ""}
	if options:
		row["options"] = options
	return row


def _promote_totals(header: dict[str, Any]) -> None:
	"""Fill grand_total from net/total_due when OCR only printed one amount."""
	if not str(header.get("grand_total") or "").strip():
		for key in ("net_total", "total_due", "amount_due", "total"):
			value = header.get(key)
			if value not in (None, ""):
				header["grand_total"] = value
				break
	if not str(header.get("net_total") or "").strip() and header.get("grand_total") not in (None, ""):
		header["net_total"] = header["grand_total"]


def _ensure_line_from_total(data: dict[str, Any]) -> None:
	"""When OCR lost the line table, seed one service row from the document total."""
	items = data.get("items")
	if isinstance(items, list) and any(
		isinstance(row, dict)
		and (str(row.get("item_code") or row.get("item_name") or row.get("description") or "").strip())
		for row in items
	):
		return
	header = data.get("header") if isinstance(data.get("header"), dict) else {}
	total = header.get("grand_total") or header.get("net_total")
	if total in (None, ""):
		return
	label = str(header.get("remarks") or header.get("bill_no") or "Services as per document").strip()
	data["items"] = [
		{
			"item_name": label if not label.startswith("SOC_") else "Services as per document",
			"description": label,
			"qty": 1,
			"rate": total,
			"amount": total,
			"uom": "Nos",
		}
	]


def _scrub_contact_noise(header: dict[str, Any]) -> None:
	"""Drop OCR values wrongly parked on contact fields (e.g. requisition → email)."""
	for key in ("email_id", "email"):
		if key in header:
			clean = _safe_email(header.get(key))
			if clean:
				header[key] = clean
			else:
				header.pop(key, None)


def _safe_email(value: Any) -> str:
	"""Drop OCR noise that is clearly not an email (requisition refs, names, etc.)."""
	text = str(value or "").strip()
	if not text or "@" not in text:
		return ""
	local, _, domain = text.partition("@")
	if not local or "." not in domain or " " in text or "/" in text:
		return ""
	return text


def _looks_like_description(value: str) -> bool:
	"""True when OCR dumped a line description into item_code instead of a SKU."""
	text = value.strip()
	if not text:
		return False
	if len(text) > 40:
		return True
	if " " in text and len(text) > 24:
		return True
	lower = text.lower()
	if any(token in lower for token in (" from ", " to ", " with ", " actionable ", " orch")):
		return True
	return False


def _clean_item_label(label: str) -> str:
	"""Drop leading qty and trailing service-window clauses from OCR line text."""
	text = re.sub(r"\s+", " ", (label or "").strip())
	if not text:
		return ""
	# "300 Critical Device with …" → drop leading quantity.
	text = re.sub(r"^\d{1,6}\s+", "", text)
	# Drop trailing "from 15th Aug'26 to 14thAug'29" style windows.
	text = re.sub(
		r"\s+from\s+\d{1,2}\w{0,2}\s+\w{3}'?\d{2}\s+to\s+\d{1,2}\w{0,2}\s*\w{3}'?\d{2}\s*$",
		"",
		text,
		flags=re.IGNORECASE,
	)
	text = re.sub(r"\s+from\s+.+\s+to\s+.+$", "", text, flags=re.IGNORECASE)
	# Prefer the clause before the first comma when OCR packed marketing copy.
	if "," in text:
		head = text.split(",", 1)[0].strip()
		if len(head) >= 8:
			text = head
	words = text.split()
	if len(words) > 8:
		text = " ".join(words[:8])
	return text.strip(" -,") or label.strip()


def _slug_code(label: str) -> str:
	slug = re.sub(r"[^A-Za-z0-9]+", "-", label).strip("-").upper()
	return (slug[:20] or "ITEM")[:140]


def proposals_complete(proposals: list[dict[str, Any]] | None) -> bool:
	"""True when every proposal is confirmed and every required field has a value."""
	if not proposals:
		return True
	for row in proposals:
		if not row.get("confirmed"):
			return False
		for field in row.get("required_fields") or []:
			if not str(field.get("value") or "").strip():
				return False
	return True


def merge_proposal_values(
	proposals: list[dict[str, Any]], updates: list[dict[str, Any]] | None
) -> list[dict[str, Any]]:
	"""Apply the clerk's consent and typed values onto the review proposals."""
	by_key = {str(row.get("key") or ""): row for row in (updates or []) if isinstance(row, dict)}
	out: list[dict[str, Any]] = []
	for base in proposals:
		row = dict(base)
		patch = by_key.get(str(row.get("key") or ""))
		if not patch:
			out.append(row)
			continue
		row["confirmed"] = bool(patch.get("confirmed"))
		values = dict(row.get("source_fields") or {})
		for bucket in ("required_fields", "optional_fields"):
			patched = {
				str(f.get("field")): str(f.get("value") or "")
				for f in (patch.get(bucket) or [])
				if isinstance(f, dict)
			}
			fields = []
			for field in row.get(bucket) or []:
				entry = dict(field)
				name = str(entry.get("field") or "")
				if name in patched:
					entry["value"] = patched[name][:140]
					values[name] = entry["value"]
				fields.append(entry)
			row[bucket] = fields
		row["source_fields"] = values
		out.append(row)
	return out


def create_confirmed(
	proposals: list[dict[str, Any]],
	*,
	can_create: Callable[[str], bool] | None = None,
) -> dict[str, Any]:
	"""Insert confirmed masters. Returns {ok, created: {link_key: name}, error_key?}."""
	import frappe

	created: dict[str, str] = {}
	savepoint = "taxmate_idp_masters"
	frappe.db.savepoint(savepoint)

	def fail(error_key: str) -> dict[str, Any]:
		frappe.db.rollback(save_point=savepoint)
		return {"ok": False, "error_key": error_key, "created": {}}

	for row in proposals:
		if not row.get("confirmed"):
			return fail("idp.propose.needConsent")
		doctype = str(row.get("doctype") or "")
		if doctype not in CREATABLE:
			return fail("idp.notice.masters")
		if can_create and not can_create(doctype):
			return fail("idp.denied")
		if not frappe.has_permission(doctype, "create"):
			return fail("idp.denied")
		for field in row.get("required_fields") or []:
			if not str(field.get("value") or "").strip():
				return fail("idp.propose.needFields")
		values = _values_from_proposal(row)
		try:
			if doctype == "Supplier":
				created["supplier"] = _create_supplier(values)
			elif doctype == "Customer":
				created["customer"] = _create_customer(values)
			elif doctype == "Item":
				name = _create_item(values)
				created["item_code"] = name
				idx = row.get("link_index")
				if idx is not None:
					created[f"item:{idx}"] = name
		except frappe.PermissionError:
			return fail("idp.denied")
		except Exception:
			frappe.log_error(title="TaxMate IDP master create failed", message=frappe.get_traceback())
			return fail("idp.propose.failed")
	return {"ok": True, "created": created}


def _values_from_proposal(row: dict[str, Any]) -> dict[str, str]:
	values = {str(k): str(v or "").strip() for k, v in (row.get("source_fields") or {}).items()}
	for bucket in ("required_fields", "optional_fields"):
		for field in row.get(bucket) or []:
			name = str(field.get("field") or "")
			if name:
				values[name] = str(field.get("value") or "").strip()
	return values


def _create_supplier(values: dict[str, str]) -> str:
	import frappe

	name = values.get("supplier_name") or ""
	existing = _existing_party("Supplier", name, values.get("tax_id"))
	if existing:
		return existing
	group = (
		frappe.db.get_single_value("Buying Settings", "supplier_group")
		or frappe.db.get_value("Supplier Group", {"is_group": 0}, "name")
		or "All Supplier Groups"
	)
	doc = frappe.get_doc(
		{
			"doctype": "Supplier",
			"supplier_name": name,
			"supplier_type": values.get("supplier_type") or "Company",
			"supplier_group": group,
			"tax_id": values.get("tax_id") or None,
			"country": "United Arab Emirates",
		}
	)
	doc.insert()
	_attach_address_contact("Supplier", doc.name, name, values)
	return doc.name


def _create_customer(values: dict[str, str]) -> str:
	import frappe

	name = values.get("customer_name") or ""
	existing = _existing_party("Customer", name, values.get("tax_id"))
	if existing:
		return existing
	group = (
		frappe.db.get_single_value("Selling Settings", "customer_group")
		or frappe.db.get_value("Customer Group", {"is_group": 0}, "name")
		or "All Customer Groups"
	)
	territory = frappe.db.get_single_value("Selling Settings", "territory") or frappe.db.get_value(
		"Territory", {"is_group": 0}, "name"
	)
	doc = frappe.get_doc(
		{
			"doctype": "Customer",
			"customer_name": name,
			"customer_type": values.get("customer_type") or "Company",
			"customer_group": group,
			"territory": territory,
			"tax_id": values.get("tax_id") or None,
		}
	)
	doc.insert()
	_attach_address_contact("Customer", doc.name, name, values)
	return doc.name


def _create_item(values: dict[str, str]) -> str:
	import frappe

	code = values.get("item_code") or _slug_code(values.get("item_name") or "ITEM")
	if frappe.db.exists("Item", code):
		return code
	by_name = frappe.db.get_value("Item", {"item_name": values.get("item_name")}, "name")
	if by_name:
		return by_name
	group = values.get("item_group") or frappe.db.get_single_value("Stock Settings", "item_group")
	if not group:
		group = frappe.db.get_value("Item Group", {"is_group": 0}, "name") or "All Item Groups"
	uom = values.get("stock_uom") or "Nos"
	if not frappe.db.exists("UOM", uom):
		uom = "Nos"
	doc = frappe.get_doc(
		{
			"doctype": "Item",
			"item_code": code,
			"item_name": values.get("item_name") or code,
			"item_group": group,
			"stock_uom": uom,
			"is_stock_item": 0,
		}
	)
	doc.insert()
	return doc.name


def _existing_party(doctype: str, name: str, tax_id: str | None) -> str | None:
	import frappe

	matched = party_by_trn(doctype, tax_id)
	if matched:
		return matched
	display = "supplier_name" if doctype == "Supplier" else "customer_name"
	if frappe.db.exists(doctype, name):
		return name
	return frappe.db.get_value(doctype, {display: name}, "name")


def _attach_address_contact(link_doctype: str, link_name: str, title: str, values: dict[str, str]) -> None:
	import frappe
	from frappe import _

	line1 = values.get("address_line1") or ""
	city = values.get("city") or ""
	state = values.get("state") or ""
	if not (line1 and city and state):
		frappe.throw(_("Address line, city, and emirate are required"))
	addr = frappe.get_doc(
		{
			"doctype": "Address",
			"address_title": title,
			"address_type": "Billing",
			"address_line1": line1,
			"city": city,
			"state": state,
			"country": "United Arab Emirates",
			"email_id": values.get("email_id") or None,
			"phone": values.get("phone") or None,
			"links": [{"link_doctype": link_doctype, "link_name": link_name}],
		}
	)
	if frappe.get_meta("Address").has_field("emirate"):
		addr.set("emirate", state)
	addr.insert()
	primary: dict[str, Any] = {}
	if link_doctype == "Supplier":
		primary["supplier_primary_address"] = addr.name
	else:
		primary["customer_primary_address"] = addr.name
	email = values.get("email_id") or ""
	phone = values.get("phone") or ""
	if email or phone:
		contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": title,
				"email_id": email or None,
				"mobile_no": phone or None,
				"links": [{"link_doctype": link_doctype, "link_name": link_name}],
			}
		)
		contact.insert()
		if link_doctype == "Supplier":
			primary["supplier_primary_contact"] = contact.name
		else:
			primary["customer_primary_contact"] = contact.name
	frappe.db.set_value(link_doctype, link_name, primary, update_modified=False)


def apply_created_links(extracted: dict[str, Any], created: dict[str, str]) -> None:
	"""Point the extract header/items at masters just created."""
	data = extracted.get("extracted_data") or {}
	header = data.get("header")
	if isinstance(header, dict):
		if created.get("supplier"):
			header["supplier"] = created["supplier"]
		if created.get("customer"):
			header["customer"] = created["customer"]
	items = data.get("items") or []
	default_item = created.get("item_code")
	for idx, row in enumerate(items):
		if not isinstance(row, dict):
			continue
		code = created.get(f"item:{idx}") or default_item
		if code and not row.get("item_code"):
			row["item_code"] = code
		elif code and str(row.get("item_code") or "") == str(row.get("item_name") or ""):
			row["item_code"] = code
