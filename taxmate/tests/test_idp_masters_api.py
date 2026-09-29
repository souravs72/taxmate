"""Site tests for consent-based Scan masters.

Callers: bench run-tests --module taxmate.tests.test_idp_masters_api.
Exercises taxmate.idp.masters.create_confirmed / apply_created_links / party_by_trn
(Supplier, Customer, Item, Address). SPA write path via idp_desk.save uses the same helpers.
Schema: proposals[{key, doctype, confirmed, required_fields, optional_fields}].

User: Implement the plan as specified… Don't stop until you have completed all the to-dos.
"""

from __future__ import annotations

import uuid

import frappe
from frappe.tests.utils import FrappeTestCase

from taxmate.idp.masters import apply_created_links, create_confirmed, party_by_trn


class TestIdpMastersApi(FrappeTestCase):
	def test_create_confirmed_supplier_and_item(self):
		suffix = uuid.uuid4().hex[:8]
		supplier_name = f"Scan Sup {suffix}"
		item_name = f"Scan Chair {suffix}"
		item_code = f"SCAN-{suffix[:6].upper()}"
		digits = "".join(str(int(c, 16) % 10) for c in suffix)
		trn = ("100" + digits + "000000000")[:15]
		proposals = [
			{
				"key": f"supplier:{supplier_name}",
				"doctype": "Supplier",
				"confirmed": True,
				"required_fields": [
					{"field": "supplier_name", "value": supplier_name},
					{"field": "supplier_type", "value": "Company"},
					{"field": "address_line1", "value": "Sheikh Zayed Rd"},
					{"field": "city", "value": "Dubai"},
					{"field": "state", "value": "Dubai"},
				],
				"optional_fields": [
					{"field": "tax_id", "value": trn},
					{"field": "email_id", "value": f"scan-{suffix}@example.com"},
					{"field": "phone", "value": "+971500000001"},
				],
				"source_fields": {},
			},
			{
				"key": f"item:{item_name}",
				"doctype": "Item",
				"link_index": 0,
				"confirmed": True,
				"required_fields": [
					{"field": "item_code", "value": item_code},
					{"field": "item_name", "value": item_name},
					{"field": "stock_uom", "value": "Nos"},
				],
				"optional_fields": [],
				"source_fields": {},
			},
		]
		made = create_confirmed(proposals)
		self.assertTrue(made.get("ok"), made)
		self.assertTrue(frappe.db.exists("Supplier", made["created"]["supplier"]))
		self.assertTrue(frappe.db.exists("Item", made["created"]["item_code"]))
		addr = frappe.db.get_value("Supplier", made["created"]["supplier"], "supplier_primary_address")
		self.assertTrue(addr)
		extracted = {
			"success": True,
			"extracted_data": {
				"doctype": "Purchase Invoice",
				"header": {"supplier": supplier_name},
				"items": [{"item_name": item_name}],
			},
		}
		apply_created_links(extracted, made["created"])
		self.assertEqual(extracted["extracted_data"]["header"]["supplier"], made["created"]["supplier"])
		self.assertEqual(extracted["extracted_data"]["items"][0]["item_code"], made["created"]["item_code"])

	def test_create_confirmed_customer(self):
		suffix = uuid.uuid4().hex[:8]
		name = f"Scan Cust {suffix}"
		digits = "".join(str(int(c, 16) % 10) for c in suffix)
		trn = ("200" + digits + "000000000")[:15]
		made = create_confirmed(
			[
				{
					"key": f"customer:{name}",
					"doctype": "Customer",
					"confirmed": True,
					"required_fields": [
						{"field": "customer_name", "value": name},
						{"field": "customer_type", "value": "Company"},
						{"field": "address_line1", "value": "Marina Walk"},
						{"field": "city", "value": "Dubai"},
						{"field": "state", "value": "Dubai"},
					],
					"optional_fields": [{"field": "tax_id", "value": trn}],
					"source_fields": {},
				}
			]
		)
		self.assertTrue(made.get("ok"), made)
		self.assertTrue(frappe.db.exists("Customer", made["created"]["customer"]))
		trn = frappe.db.get_value("Customer", made["created"]["customer"], "tax_id")
		matched = party_by_trn("Customer", trn)
		self.assertEqual(matched, made["created"]["customer"])

	def test_unconfirmed_proposal_is_refused(self):
		made = create_confirmed(
			[
				{
					"key": "supplier:No",
					"doctype": "Supplier",
					"confirmed": False,
					"required_fields": [{"field": "supplier_name", "value": "No"}],
					"optional_fields": [],
					"source_fields": {},
				}
			]
		)
		self.assertFalse(made["ok"])
		self.assertEqual(made["error_key"], "idp.propose.needConsent")
