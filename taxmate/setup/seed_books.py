"""Seed a realistic UAE trading company for TaxMate UAT / local review.

Creates masters and ~9 months of submitted sales, purchases, and payments.
Names avoid DEMO/E2E/TEST prefixes. Idempotent per company: skips when the
company already has a seeded customer marker.

Run:
  bench --site <site> execute taxmate.setup.seed_books.run
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date

import frappe
from frappe.utils import add_days, getdate

from taxmate.uae.constants import UAE_COUNTRY
from taxmate.uae.setup import ensure_company_uae_ready

COMPANY_NAME = "Tax Mate"
COMPANY_ABBR = "TM"
COMPANY_TRN = "100245678900003"
SEED_MARKER_CUSTOMER = "Palm Grove Retail LLC"

CUSTOMERS: list[dict] = [
	{"name": "Palm Grove Retail LLC", "trn": "100312459800003", "emirate": "Dubai", "type": "Company"},
	{"name": "Al Noor Facilities FZ-LLC", "trn": "100398761200003", "emirate": "Dubai", "type": "Company"},
	{"name": "Gulf Ledger Advisory LLC", "trn": "100276543100003", "emirate": "Abu Dhabi", "type": "Company"},
	{"name": "Marina Office Fitout LLC", "trn": "100455667700003", "emirate": "Dubai", "type": "Company"},
	{"name": "Shams Procurement Co. LLC", "trn": "100188992200003", "emirate": "Sharjah", "type": "Company"},
	{"name": "Barakah Clinics Group LLC", "trn": "100533441100003", "emirate": "Abu Dhabi", "type": "Company"},
	{"name": "Horizon Properties LLC", "trn": "100622778800003", "emirate": "Dubai", "type": "Company"},
	{"name": "Saqr Logistics LLC", "trn": "100711223300003", "emirate": "Ajman", "type": "Company"},
	{"name": "Quay Hospitality LLC", "trn": "100844556600003", "emirate": "Dubai", "type": "Company"},
	{"name": "Falcon IT Services LLC", "trn": "100955667700003", "emirate": "Dubai", "type": "Company"},
	{"name": "Walk-in Customer", "trn": None, "emirate": "Dubai", "type": "Individual"},
	{
		"name": "Nordic Tax Partners AB",
		"trn": None,
		"emirate": "Dubai",
		"type": "Company",
		"territory": "Rest Of The World",
	},
]

SUPPLIERS: list[dict] = [
	{"name": "Desert Supplies LLC", "trn": "100167889900003", "group": "Local", "country": UAE_COUNTRY},
	{"name": "Emirates Office Systems LLC", "trn": "100278991100003", "group": "Local", "country": UAE_COUNTRY},
	{"name": "Jebel Ali Packaging LLC", "trn": "100389112200003", "group": "Local", "country": UAE_COUNTRY},
	{"name": "Al Ain Print & Paper LLC", "trn": "100490223300003", "group": "Local", "country": UAE_COUNTRY},
	{"name": "Shenzhen Office Hardware Ltd", "trn": None, "group": "Distributor", "country": "China"},
	{"name": "Guangzhou Furnishings Co Ltd", "trn": None, "group": "Distributor", "country": "China"},
	{"name": "Karachi Textile Exports", "trn": None, "group": "Distributor", "country": "Pakistan"},
	{"name": "Utilities - DEWA", "trn": "100100200300003", "group": "Services", "country": UAE_COUNTRY},
]

ITEMS: list[dict] = [
	{"code": "CHR-ERG-01", "name": "Ergonomic Mesh Office Chair", "group": "Products", "stock": 1, "rate": 685, "buy": 410, "uom": "Nos"},
	{"code": "DSK-STD-01", "name": "Height-Adjustable Desk 140cm", "group": "Products", "stock": 1, "rate": 1450, "buy": 920, "uom": "Nos"},
	{"code": "MON-27-01", "name": "27-inch IPS Monitor", "group": "Products", "stock": 1, "rate": 980, "buy": 640, "uom": "Nos"},
	{"code": "KB-MEC-01", "name": "Mechanical Keyboard", "group": "Products", "stock": 1, "rate": 320, "buy": 185, "uom": "Nos"},
	{"code": "MSE-WL-01", "name": "Wireless Mouse", "group": "Products", "stock": 1, "rate": 95, "buy": 48, "uom": "Nos"},
	{"code": "LMP-LED-01", "name": "LED Desk Lamp", "group": "Products", "stock": 1, "rate": 145, "buy": 72, "uom": "Nos"},
	{"code": "FIL-A4-01", "name": "A4 Filing Cabinet 4-Drawer", "group": "Products", "stock": 1, "rate": 890, "buy": 540, "uom": "Nos"},
	{"code": "WST-BIN-01", "name": "Office Waste Bin Set", "group": "Consumable", "stock": 1, "rate": 65, "buy": 28, "uom": "Nos"},
	{"code": "PAP-A4-01", "name": "A4 Copy Paper (5 Reams)", "group": "Consumable", "stock": 1, "rate": 78, "buy": 42, "uom": "Nos"},
	{"code": "CBL-USB-01", "name": "USB-C Hub 7-in-1", "group": "Products", "stock": 1, "rate": 210, "buy": 115, "uom": "Nos"},
	{"code": "SVC-VAT-ADVISORY", "name": "VAT Advisory Retainer (Monthly)", "group": "Services", "stock": 0, "rate": 4500, "buy": 0, "uom": "Nos", "sac": "998311"},
	{"code": "SVC-BOOKKEEP", "name": "Bookkeeping Package", "group": "Services", "stock": 0, "rate": 2800, "buy": 0, "uom": "Nos", "sac": "998311"},
	{"code": "SVC-PAYROLL", "name": "Payroll Processing", "group": "Services", "stock": 0, "rate": 1600, "buy": 0, "uom": "Nos", "sac": "998311"},
	{"code": "SVC-IMPL", "name": "ERP Implementation Day Rate", "group": "Services", "stock": 0, "rate": 2200, "buy": 0, "uom": "Nos", "sac": "998314"},
	{"code": "SVC-TRAIN", "name": "Staff Training Workshop", "group": "Services", "stock": 0, "rate": 3500, "buy": 0, "uom": "Nos", "sac": "999293"},
	{"code": "SVC-ZERO-EXP", "name": "Cross-border Advisory (Export)", "group": "Services", "stock": 0, "rate": 5000, "buy": 0, "uom": "Nos", "sac": "998311", "zero": 1},
]

STOCK_PREFIXES = ("CHR", "DSK", "MON", "KB", "MSE", "LMP", "FIL", "WST", "PAP", "CBL")


def run(force: bool | int | str = False) -> dict:
	"""Create company (if missing) and seed books. Returns counts."""
	force = bool(force) if not isinstance(force, str) else force.lower() in ("1", "true", "yes")
	frappe.flags.in_import = True
	frappe.set_user("Administrator")

	_ensure_fiscal_year()
	company = _ensure_company()
	ensure_company_uae_ready(company)
	frappe.db.commit()

	if (
		not force
		and frappe.db.exists("Customer", SEED_MARKER_CUSTOMER)
		and frappe.db.count("Sales Invoice", {"company": company, "docstatus": 1}) >= 20
	):
		return {"company": company, "skipped": True, "reason": "already seeded"}

	abbr = frappe.db.get_value("Company", company, "abbr")
	ctx = _context(company, abbr)

	_ensure_bank(ctx)
	_ensure_customers()
	_ensure_suppliers()
	_ensure_items(ctx)
	frappe.db.commit()

	_receive_opening_stock(ctx)
	frappe.db.commit()

	sales = _seed_sales(ctx)
	purchases = _seed_purchases(ctx)
	payments = _seed_payments(ctx)
	_ensure_spa_users(ctx)
	_ensure_legacy_prove_aliases()
	if frappe.db.exists("Item", "DEMO-VAT-CONSULTING"):
		frappe.db.set_value("Item", "DEMO-VAT-CONSULTING", "disabled", 1)
	frappe.db.commit()
	frappe.clear_cache()

	return {
		"company": company,
		"customers": frappe.db.count("Customer"),
		"suppliers": frappe.db.count("Supplier"),
		"items": frappe.db.count("Item"),
		"sales_invoices": sales,
		"purchase_invoices": purchases,
		"payment_entries": payments,
	}


def _ensure_fiscal_year() -> None:
	if frappe.db.exists("Fiscal Year", "2026"):
		return
	frappe.get_doc(
		{
			"doctype": "Fiscal Year",
			"year": "2026",
			"year_start_date": "2026-01-01",
			"year_end_date": "2026-12-31",
		}
	).insert(ignore_permissions=True)


def _ensure_company() -> str:
	if frappe.db.exists("Company", COMPANY_NAME):
		doc = frappe.get_doc("Company", COMPANY_NAME)
		changed = False
		if doc.country != UAE_COUNTRY:
			doc.country = UAE_COUNTRY
			changed = True
		if (doc.tax_id or "") != COMPANY_TRN:
			doc.tax_id = COMPANY_TRN
			changed = True
		if doc.default_currency != "AED":
			doc.default_currency = "AED"
			changed = True
		if changed:
			doc.flags.ignore_permissions = True
			doc.save()
		frappe.db.set_default("company", COMPANY_NAME)
		return COMPANY_NAME

	from erpnext.setup.setup_wizard.operations import install_fixtures as fixtures
	from erpnext.setup.setup_wizard.operations.install_fixtures import install_company, install_defaults

	args = frappe._dict(
		{
			"company_name": COMPANY_NAME,
			"company_abbr": COMPANY_ABBR,
			"currency": "AED",
			"country": UAE_COUNTRY,
			"chart_of_accounts": "Standard",
			"domain": "Distribution",
			"fy_start_date": "2026-01-01",
			"fy_end_date": "2026-12-31",
			"language": "en",
			"timezone": "Asia/Dubai",
		}
	)
	try:
		fixtures.install(UAE_COUNTRY)
	except Exception:
		frappe.log_error(title="TaxMate seed fixtures.install", message=frappe.get_traceback())

	if not frappe.db.exists("Company", COMPANY_NAME):
		install_company(args)
	install_defaults(args)

	company = frappe.get_doc("Company", COMPANY_NAME)
	company.tax_id = COMPANY_TRN
	company.flags.ignore_permissions = True
	company.save()
	frappe.db.set_default("company", COMPANY_NAME)
	frappe.db.set_default("currency", "AED")
	return COMPANY_NAME


def _context(company: str, abbr: str) -> dict:
	wh = frappe.db.get_value("Warehouse", {"company": company, "warehouse_name": "Stores"}, "name")
	if not wh:
		wh = frappe.db.get_value("Warehouse", {"company": company, "is_group": 0}, "name")
	return {
		"company": company,
		"abbr": abbr,
		"warehouse": wh,
		"cost_center": frappe.db.get_value("Company", company, "cost_center"),
		"cash": frappe.db.get_value(
			"Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name"
		),
		"bank_gl": frappe.db.get_value(
			"Account", {"company": company, "account_type": "Bank", "is_group": 0}, "name"
		)
		or frappe.db.get_value(
			"Account",
			{"company": company, "account_name": "Banks Current Accounts", "is_group": 0},
			"name",
		),
		"income": frappe.db.get_value("Company", company, "default_income_account")
		or frappe.db.get_value("Account", {"company": company, "account_name": "Sales Account"}, "name"),
		"cogs": frappe.db.get_value("Company", company, "default_expense_account"),
		"sales_tax": frappe.db.get_value(
			"Sales Taxes and Charges Template", {"company": company, "title": "UAE VAT 5%"}, "name"
		)
		or frappe.db.get_value(
			"Sales Taxes and Charges Template", {"company": company, "is_default": 1}, "name"
		),
		"sales_tax_zero": frappe.db.get_value(
			"Sales Taxes and Charges Template", {"company": company, "title": "UAE VAT Zero"}, "name"
		),
		"purchase_tax": frappe.db.get_value(
			"Purchase Taxes and Charges Template", {"company": company, "title": "UAE VAT 5%"}, "name"
		)
		or frappe.db.get_value(
			"Purchase Taxes and Charges Template", {"company": company, "is_default": 1}, "name"
		),
		"item_tax_5": frappe.db.get_value(
			"Item Tax Template", {"company": company, "title": "UAE VAT 5%"}, "name"
		),
		"item_tax_zero": frappe.db.get_value(
			"Item Tax Template", {"company": company, "title": "UAE VAT Zero"}, "name"
		),
	}


def _ensure_bank(ctx: dict) -> None:
	"""Create Emirates NBD bank + leaf GL account (UAE Standard chart only has a Bank group)."""
	if not frappe.db.exists("Bank", "Emirates NBD"):
		frappe.get_doc({"doctype": "Bank", "bank_name": "Emirates NBD"}).insert(ignore_permissions=True)

	bank_gl = ctx.get("bank_gl")
	if not bank_gl:
		parent = frappe.db.get_value(
			"Account",
			{"company": ctx["company"], "account_type": "Bank", "is_group": 1},
			"name",
		)
		leaf_name = f"Banks Current Accounts - {ctx['abbr']}"
		if parent and not frappe.db.exists("Account", leaf_name):
			acc = frappe.get_doc(
				{
					"doctype": "Account",
					"account_name": "Banks Current Accounts",
					"parent_account": parent,
					"company": ctx["company"],
					"account_type": "Bank",
					"is_group": 0,
					"account_currency": "AED",
				}
			)
			acc.insert(ignore_permissions=True)
			bank_gl = acc.name
		elif frappe.db.exists("Account", leaf_name):
			bank_gl = leaf_name
		ctx["bank_gl"] = bank_gl

	if not bank_gl:
		return
	if frappe.db.exists("Bank Account", {"account_name": "Operating Account", "company": ctx["company"]}):
		return
	frappe.get_doc(
		{
			"doctype": "Bank Account",
			"account_name": "Operating Account",
			"bank": "Emirates NBD",
			"account": bank_gl,
			"is_company_account": 1,
			"company": ctx["company"],
			"is_default": 1,
		}
	).insert(ignore_permissions=True)


def _ensure_customers() -> None:
	for row in CUSTOMERS:
		if frappe.db.exists("Customer", row["name"]):
			continue
		territory = row.get("territory") or "United Arab Emirates"
		if not frappe.db.exists("Territory", territory):
			territory = "All Territories"
		cg = "Commercial" if row["type"] == "Company" else "Individual"
		if not frappe.db.exists("Customer Group", cg):
			cg = "All Customer Groups"
		doc = frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": row["name"],
				"customer_type": row["type"],
				"customer_group": cg,
				"territory": territory,
				"tax_id": row.get("trn"),
				"default_currency": "AED",
			}
		)
		doc.insert(ignore_permissions=True)
		_party_address("Customer", doc.name, row.get("emirate") or "Dubai", row.get("trn"))


def _ensure_suppliers() -> None:
	for row in SUPPLIERS:
		if frappe.db.exists("Supplier", row["name"]):
			continue
		group = row["group"] if frappe.db.exists("Supplier Group", row["group"]) else "All Supplier Groups"
		doc = frappe.get_doc(
			{
				"doctype": "Supplier",
				"supplier_name": row["name"],
				"supplier_group": group,
				"supplier_type": "Company",
				"country": row["country"],
				"tax_id": row.get("trn"),
				"default_currency": "AED" if row["country"] == UAE_COUNTRY else "USD",
			}
		)
		doc.insert(ignore_permissions=True)
		if row["country"] == UAE_COUNTRY:
			_party_address("Supplier", doc.name, "Dubai", row.get("trn"))


def _party_address(party_type: str, party: str, emirate: str, trn: str | None) -> None:
	if frappe.db.exists("Address", {"address_title": party, "address_type": "Billing"}):
		return
	doc = frappe.get_doc(
		{
			"doctype": "Address",
			"address_title": party,
			"address_type": "Billing",
			"address_line1": "Office 1204, Business Bay",
			"city": emirate,
			"country": UAE_COUNTRY,
			"pincode": "00000",
			"links": [{"link_doctype": party_type, "link_name": party}],
		}
	)
	if doc.meta.has_field("emirate"):
		doc.emirate = emirate
	if trn and doc.meta.has_field("tax_id"):
		doc.tax_id = trn
	doc.insert(ignore_permissions=True)


def _ensure_items(ctx: dict) -> None:
	for row in ITEMS:
		if frappe.db.exists("Item", row["code"]):
			continue
		group = row["group"] if frappe.db.exists("Item Group", row["group"]) else "All Item Groups"
		tax_template = ctx["item_tax_zero"] if row.get("zero") else ctx["item_tax_5"]
		doc = frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": row["code"],
				"item_name": row["name"],
				"item_group": group,
				"stock_uom": row["uom"],
				"is_stock_item": row["stock"],
				"is_sales_item": 1,
				"is_purchase_item": 1,
				"include_item_in_manufacturing": 0,
				"item_defaults": [
					{
						"company": ctx["company"],
						"default_warehouse": ctx["warehouse"] if row["stock"] else None,
						"income_account": ctx["income"],
						"expense_account": ctx["cogs"],
					}
				],
			}
		)
		if doc.meta.has_field("uae_item_type"):
			doc.uae_item_type = "Goods" if row["stock"] else "Service"
		if row.get("sac") and doc.meta.has_field("sac_code"):
			doc.sac_code = row["sac"]
		if row.get("zero") and doc.meta.has_field("is_zero_rated"):
			doc.is_zero_rated = 1
		if tax_template:
			doc.append("taxes", {"item_tax_template": tax_template, "tax_category": ""})
		doc.insert(ignore_permissions=True)

		if row["rate"]:
			_item_price(row["code"], "Standard Selling", row["rate"])
		if row["buy"]:
			_item_price(row["code"], "Standard Buying", row["buy"])


def _item_price(item: str, price_list: str, rate: float) -> None:
	if not frappe.db.exists("Price List", price_list):
		return
	if frappe.db.exists("Item Price", {"item_code": item, "price_list": price_list}):
		return
	frappe.get_doc(
		{
			"doctype": "Item Price",
			"item_code": item,
			"price_list": price_list,
			"price_list_rate": rate,
			"currency": "AED",
		}
	).insert(ignore_permissions=True)


def _ensure_legacy_prove_aliases() -> None:
	"""Prove-it tests still look for DEMO-VAT-CONSULTING on Tax Mate."""
	if frappe.db.exists("Item", "DEMO-VAT-CONSULTING") or not frappe.db.exists("Item", "SVC-VAT-ADVISORY"):
		return
	src = frappe.get_doc("Item", "SVC-VAT-ADVISORY")
	doc = frappe.copy_doc(src)
	doc.item_code = "DEMO-VAT-CONSULTING"
	doc.item_name = "VAT Advisory Retainer (Monthly)"
	doc.insert(ignore_permissions=True)


def _receive_opening_stock(ctx: dict) -> None:
	if not ctx["warehouse"]:
		return
	stock_items = [i for i in ITEMS if i["stock"]]
	if frappe.db.exists("Stock Ledger Entry", {"item_code": stock_items[0]["code"], "is_cancelled": 0}):
		return

	rows = [
		{
			"item_code": item["code"],
			"qty": 80,
			"basic_rate": item["buy"] or 50,
			"t_warehouse": ctx["warehouse"],
			"uom": item["uom"],
			"conversion_factor": 1,
			"transfer_qty": 80,
		}
		for item in stock_items
	]
	se = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"purpose": "Material Receipt",
			"company": ctx["company"],
			"posting_date": "2026-01-02",
			"posting_time": "10:00:00",
			"set_posting_time": 1,
			"items": rows,
		}
	)
	se.insert(ignore_permissions=True)
	se.submit()


def _months() -> list[date]:
	today = getdate(frappe.utils.today())
	end = min(today, getdate("2026-09-23"))
	out: list[date] = []
	month = 1
	while date(2026, month, 1) <= end:
		out.append(date(2026, month, 1))
		month += 1
		if month > 12:
			break
	return out


def _is_stock_line(item_code: str) -> bool:
	return item_code.split("-", 1)[0] in STOCK_PREFIXES or any(
		item_code.startswith(p) for p in STOCK_PREFIXES
	)


def _seed_sales(ctx: dict) -> int:
	customers = [c["name"] for c in CUSTOMERS if c["name"] != "Walk-in Customer"]
	stock = [i for i in ITEMS if i["stock"]]
	services = [i for i in ITEMS if not i["stock"] and not i.get("zero")]
	created = 0

	for mi, month_start in enumerate(_months()):
		_, last = monthrange(month_start.year, month_start.month)
		for n in range(5 + (mi % 3)):
			day = 3 + (n * 4) % max(last - 2, 1)
			posting = date(month_start.year, month_start.month, min(day, last))
			customer = customers[(mi * 7 + n) % len(customers)]

			if n % 4 == 0:
				item = services[n % len(services)]
				lines = [{"item_code": item["code"], "qty": 1, "rate": item["rate"]}]
				tax = ctx["sales_tax"]
				update_stock = 0
			elif n % 4 == 1 and ctx["sales_tax_zero"]:
				item = next(i for i in ITEMS if i.get("zero"))
				lines = [{"item_code": item["code"], "qty": 1, "rate": item["rate"]}]
				tax = ctx["sales_tax_zero"]
				customer = "Nordic Tax Partners AB"
				update_stock = 0
			else:
				a = stock[(mi + n) % len(stock)]
				b = stock[(mi + n + 3) % len(stock)]
				lines = [
					{"item_code": a["code"], "qty": 2 + (n % 3), "rate": a["rate"]},
					{"item_code": b["code"], "qty": 1 + (n % 2), "rate": b["rate"]},
				]
				tax = ctx["sales_tax"]
				update_stock = 1

			if _invoice_exists("Sales Invoice", ctx["company"], posting, customer):
				continue

			doc = frappe.get_doc(
				{
					"doctype": "Sales Invoice",
					"company": ctx["company"],
					"customer": customer,
					"posting_date": posting.isoformat(),
					"due_date": add_days(posting, 30).isoformat(),
					"set_posting_time": 1,
					"currency": "AED",
					"conversion_rate": 1,
					"selling_price_list": "Standard Selling",
					"price_list_currency": "AED",
					"plc_conversion_rate": 1,
					"update_stock": update_stock,
					"set_warehouse": ctx["warehouse"] if update_stock else None,
					"taxes_and_charges": tax,
					"items": lines,
				}
			)
			if doc.meta.has_field("vat_emirate"):
				doc.vat_emirate = next(
					(c["emirate"] for c in CUSTOMERS if c["name"] == customer and c.get("emirate")),
					"Dubai",
				)
			try:
				doc.insert(ignore_permissions=True)
				doc.submit()
				created += 1
			except Exception:
				frappe.db.rollback()
				frappe.log_error(title=f"seed SI {posting} {customer}", message=frappe.get_traceback())
				frappe.db.begin()
	return created


def _seed_purchases(ctx: dict) -> int:
	local = [s["name"] for s in SUPPLIERS if s["country"] == UAE_COUNTRY and "DEWA" not in s["name"]]
	stock = [i for i in ITEMS if i["stock"]]
	created = 0

	for mi, month_start in enumerate(_months()):
		_, last = monthrange(month_start.year, month_start.month)
		for n in range(3 + (mi % 2)):
			day = 5 + (n * 7) % max(last - 3, 1)
			posting = date(month_start.year, month_start.month, min(day, last))
			supplier = local[(mi + n) % len(local)]
			item = stock[(mi + n * 2) % len(stock)]
			if _invoice_exists("Purchase Invoice", ctx["company"], posting, supplier):
				continue
			bill_no = f"SUP-{month_start.month:02d}-{n + 1:02d}-{mi}"
			doc = frappe.get_doc(
				{
					"doctype": "Purchase Invoice",
					"company": ctx["company"],
					"supplier": supplier,
					"posting_date": posting.isoformat(),
					"due_date": add_days(posting, 21).isoformat(),
					"bill_no": bill_no,
					"bill_date": posting.isoformat(),
					"set_posting_time": 1,
					"currency": "AED",
					"conversion_rate": 1,
					"buying_price_list": "Standard Buying",
					"price_list_currency": "AED",
					"plc_conversion_rate": 1,
					"update_stock": 1,
					"set_warehouse": ctx["warehouse"],
					"taxes_and_charges": ctx["purchase_tax"],
					"items": [
						{
							"item_code": item["code"],
							"qty": 8 + n * 2,
							"rate": item["buy"],
							"warehouse": ctx["warehouse"],
						}
					],
				}
			)
			try:
				doc.insert(ignore_permissions=True)
				doc.submit()
				created += 1
			except Exception:
				frappe.db.rollback()
				frappe.log_error(title=f"seed PI {bill_no}", message=frappe.get_traceback())
				frappe.db.begin()

		util_day = date(month_start.year, month_start.month, min(28, last))
		if not _invoice_exists("Purchase Invoice", ctx["company"], util_day, "Utilities - DEWA"):
			try:
				doc = frappe.get_doc(
					{
						"doctype": "Purchase Invoice",
						"company": ctx["company"],
						"supplier": "Utilities - DEWA",
						"posting_date": util_day.isoformat(),
						"due_date": util_day.isoformat(),
						"bill_no": f"DEWA-{month_start.month:02d}-2026",
						"bill_date": util_day.isoformat(),
						"set_posting_time": 1,
						"currency": "AED",
						"conversion_rate": 1,
						"update_stock": 0,
						"taxes_and_charges": ctx["purchase_tax"],
						"items": [{"item_code": "PAP-A4-01", "qty": 1, "rate": 850 + mi * 40}],
					}
				)
				doc.insert(ignore_permissions=True)
				doc.submit()
				created += 1
			except Exception:
				frappe.db.rollback()
				frappe.log_error(title="seed DEWA", message=frappe.get_traceback())
				frappe.db.begin()
	return created


def _invoice_exists(doctype: str, company: str, posting: date, party: str) -> bool:
	party_field = "customer" if doctype == "Sales Invoice" else "supplier"
	return bool(
		frappe.db.exists(
			doctype,
			{
				party_field: party,
				"company": company,
				"posting_date": posting.isoformat(),
				"docstatus": ["<", 2],
			},
		)
	)


def _seed_payments(ctx: dict) -> int:
	created = 0
	mode = "Wire Transfer" if frappe.db.exists("Mode of Payment", "Wire Transfer") else "Cash"
	paid_account = ctx["bank_gl"] or ctx["cash"]
	if not paid_account:
		return 0

	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	for doctype in ("Sales Invoice", "Purchase Invoice"):
		rows = frappe.get_all(
			doctype,
			filters={"company": ctx["company"], "docstatus": 1, "outstanding_amount": [">", 0.01]},
			fields=["name", "posting_date"],
			order_by="posting_date asc",
			limit_page_length=80,
		)
		for i, row in enumerate(rows):
			if i % 3 == 0:
				continue
			try:
				pe = get_payment_entry(doctype, row.name)
				pe.posting_date = add_days(row.posting_date, 7)
				pe.mode_of_payment = mode
				if doctype == "Sales Invoice":
					pe.paid_to = paid_account
				else:
					pe.paid_from = paid_account
				pe.reference_no = f"TRX-{row.name[-6:]}"
				pe.reference_date = pe.posting_date
				pe.insert(ignore_permissions=True)
				pe.submit()
				created += 1
			except Exception:
				frappe.db.rollback()
				frappe.log_error(title=f"seed PE {row.name}", message=frappe.get_traceback())
				frappe.db.begin()
	return created


def _ensure_spa_users(ctx: dict) -> None:
	from taxmate.setup.spa_roles import apply_spa_role, ensure_spa_roles

	ensure_spa_roles()
	users = [
		{"email": "owner@manara.ae", "first_name": "Layla", "last_name": "Al Hashimi", "role": "owner"},
		{"email": "accountant@manara.ae", "first_name": "Omar", "last_name": "Farouk", "role": "accountant"},
	]
	for u in users:
		if not frappe.db.exists("User", u["email"]):
			user = frappe.get_doc(
				{
					"doctype": "User",
					"email": u["email"],
					"first_name": u["first_name"],
					"last_name": u["last_name"],
					"send_welcome_email": 0,
					"user_type": "System User",
				}
			)
			user.insert(ignore_permissions=True)
			user.new_password = "TaxMate.UAT.2026"
			user.save(ignore_permissions=True)
		apply_spa_role(u["email"], u["role"])
		frappe.defaults.set_user_default("company", ctx["company"], u["email"])
