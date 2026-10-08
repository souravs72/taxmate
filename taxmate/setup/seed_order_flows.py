"""Seed linked ERPNext sales/purchase flows for UAT demo companies.

Importers/callers: bench execute only —
  ``taxmate.setup.seed_order_flows.run`` (no SPA/API catalog entry).
Affected API: none.
Data schemas: creates Quotation, Sales Order, Delivery Note, Sales Invoice,
Purchase Order, Purchase Receipt, Purchase Invoice, Stock Entry; may cancel
UAE VAT 201 Filing Log rows that lock the demo months.
User instruction: "I see a lot of companies don't follow the orderly usage of
Sales and Purchase... Please ensure to create enough docs for the least 3 months
so that we can show it to the client during demo but ensure the quality of demo
data looks professional and clean and similar to real world production standard"

Creates professional, production-style chains for the last three calendar months:

  Stock sales:     Quotation → Sales Order → Delivery Note → Sales Invoice
  Service sales:   Quotation → Sales Order → Sales Invoice
  Stock purchase:  Purchase Order → Purchase Receipt → Purchase Invoice
  Service purchase: Purchase Order → Purchase Invoice

Uses existing company masters (customers, suppliers, items, warehouses, taxes).
Idempotent via remark marker ``FLOW-{abbr}-{YYYYMM}-{seq}``.

Run:
  bench --site <site> execute taxmate.setup.seed_order_flows.run
  bench --site <site> execute taxmate.setup.seed_order_flows.run --kwargs '{"companies":["Al Noor Jewellers LLC"]}'
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date

import frappe
from frappe.utils import add_days, cint, flt, getdate

# Marker prefix for idempotency across doctypes that lack a shared remarks field:
# Quotation/PO/PR → title (or supplier_delivery_note on PR); Sales Order/DN → po_no;
# SI/PI → remarks when present.
FLOW_MARKER = "FLOW"

# Per-company demo profile: volume and whether stock fulfilment applies.
COMPANY_PROFILES: dict[str, dict] = {
	"Al Madina Hypermarket LLC": {
		"kind": "retail",
		"sales_per_month": 4,
		"purchase_per_month": 3,
		"use_delivery": True,
		"use_receipt": True,
	},
	"Al Noor Jewellers LLC": {
		"kind": "jewellery",
		"sales_per_month": 3,
		"purchase_per_month": 2,
		"use_delivery": True,
		"use_receipt": True,
	},
	"Ascra Technology LLP": {
		"kind": "distribution",
		"sales_per_month": 3,
		"purchase_per_month": 2,
		"use_delivery": True,
		"use_receipt": True,
	},
	"Brightpath Consulting FZ-LLC": {
		"kind": "services",
		"sales_per_month": 3,
		"purchase_per_month": 2,
		"use_delivery": False,
		"use_receipt": False,
	},
	"Gulfline General Trading LLC": {
		"kind": "trading",
		"sales_per_month": 3,
		"purchase_per_month": 2,
		"use_delivery": True,
		"use_receipt": True,
	},
	"Olive Grove Kitchen LLC": {
		"kind": "fnb",
		"sales_per_month": 3,
		"purchase_per_month": 2,
		"use_delivery": True,
		"use_receipt": True,
	},
}


def run(companies: list[str] | None = None, force: bool | int | str = False) -> dict:
	"""Seed linked order flows for one or more companies. Returns per-company counts."""
	force = bool(force) if not isinstance(force, str) else force.lower() in ("1", "true", "yes")
	frappe.flags.in_import = True
	frappe.set_user("Administrator")

	targets = companies or list(COMPANY_PROFILES.keys())
	months = _demo_months()
	summary: dict[str, dict] = {"months": [m.isoformat() for m in months], "companies": {}}

	for company in targets:
		if not frappe.db.exists("Company", company):
			summary["companies"][company] = {"error": "company missing"}
			continue
		profile = COMPANY_PROFILES.get(company) or {
			"kind": "trading",
			"sales_per_month": 3,
			"purchase_per_month": 2,
			"use_delivery": True,
			"use_receipt": True,
		}
		try:
			_unlock_vat_for_months(company, months)
			ctx = _build_context(company, profile)
			if not ctx.get("customers") or not ctx.get("items_sales"):
				summary["companies"][company] = {
					"error": "missing customers or sales items",
					"ctx": _ctx_debug(ctx),
				}
				continue
			_top_up_stock(ctx)
			frappe.db.commit()
			created = _seed_company(ctx, months, force=force)
			repaired = _repair_incomplete_flows(ctx)
			frappe.db.commit()
			created["repaired"] = repaired
			summary["companies"][company] = created
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"seed_order_flows {company}", message=frappe.get_traceback())
			summary["companies"][company] = {"error": frappe.get_traceback().splitlines()[-1]}

	frappe.clear_cache()
	return summary


def _demo_months() -> list[date]:
	"""Three calendar months ending at the current month."""
	today = getdate(frappe.utils.today())
	anchor = today.replace(day=1)
	months: list[date] = []
	cursor = anchor
	for _ in range(3):
		months.append(cursor)
		year, month = cursor.year, cursor.month - 1
		if month < 1:
			month = 12
			year -= 1
		cursor = date(year, month, 1)
	months.reverse()
	return months


def _unlock_vat_for_months(company: str, months: list[date]) -> None:
	"""Cancel submitted VAT 201 filings that cover the demo months so SI/PI can post."""
	if not months:
		return
	start = months[0]
	end = date(months[-1].year, months[-1].month, monthrange(months[-1].year, months[-1].month)[1])
	rows = frappe.get_all(
		"UAE VAT 201 Filing Log",
		filters={"company": company, "docstatus": 1},
		fields=["name", "period_start", "period_end"],
	)
	for row in rows:
		ps, pe = getdate(row.period_start), getdate(row.period_end)
		if pe < start or ps > end:
			continue
		try:
			doc = frappe.get_doc("UAE VAT 201 Filing Log", row.name)
			doc.cancel()
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			try:
				frappe.db.set_value(
					"UAE VAT 201 Filing Log", row.name, "docstatus", 2, update_modified=False
				)
				frappe.db.commit()
			except Exception:
				frappe.db.rollback()
				frappe.log_error(title=f"unlock VAT {row.name}", message=frappe.get_traceback())


def _build_context(company: str, profile: dict) -> dict:
	abbr = frappe.db.get_value("Company", company, "abbr")
	warehouse = frappe.db.get_value(
		"Warehouse", {"company": company, "warehouse_name": "Stores", "is_group": 0}, "name"
	) or frappe.db.get_value(
		"Warehouse", {"company": company, "is_group": 0}, "name", order_by="creation asc"
	)
	sales_tax = frappe.db.get_value(
		"Sales Taxes and Charges Template", {"company": company, "is_default": 1}, "name"
	) or frappe.db.get_value("Sales Taxes and Charges Template", {"company": company}, "name")
	purchase_tax = frappe.db.get_value(
		"Purchase Taxes and Charges Template", {"company": company, "is_default": 1}, "name"
	) or frappe.db.get_value("Purchase Taxes and Charges Template", {"company": company}, "name")
	cost_center = frappe.db.get_value("Company", company, "cost_center") or frappe.db.get_value(
		"Cost Center", {"company": company, "is_group": 0}, "name"
	)

	customers = [
		r[0]
		for r in frappe.db.sql(
			"""
			select distinct customer from `tabSales Invoice`
			where company=%s and docstatus=1 and ifnull(customer,'')!=''
			order by customer
			limit 12
			""",
			company,
		)
	]
	if not customers:
		customers = frappe.get_all("Customer", filters={"disabled": 0}, pluck="name", limit_page_length=12)

	suppliers = [
		r[0]
		for r in frappe.db.sql(
			"""
			select distinct supplier from `tabPurchase Invoice`
			where company=%s and docstatus=1 and ifnull(supplier,'')!=''
			order by supplier
			limit 12
			""",
			company,
		)
	]
	if not suppliers:
		suppliers = frappe.get_all("Supplier", filters={"disabled": 0}, pluck="name", limit_page_length=12)

	items_sales = _items_for_company(company, sales=True, stock_only=bool(profile.get("use_delivery")))
	if profile.get("kind") == "services" or not items_sales:
		items_sales = _items_for_company(company, sales=True, stock_only=False)
	items_purchase = _items_for_company(company, sales=False, stock_only=bool(profile.get("use_receipt")))
	if not items_purchase:
		items_purchase = _items_for_company(company, sales=False, stock_only=False)

	return {
		"company": company,
		"abbr": abbr,
		"profile": profile,
		"warehouse": warehouse,
		"sales_tax": sales_tax,
		"purchase_tax": purchase_tax,
		"cost_center": cost_center,
		"customers": customers,
		"suppliers": suppliers,
		"items_sales": items_sales,
		"items_purchase": items_purchase,
		"currency": frappe.db.get_value("Company", company, "default_currency") or "AED",
	}


def _ctx_debug(ctx: dict) -> dict:
	return {
		"warehouse": ctx.get("warehouse"),
		"customers": len(ctx.get("customers") or []),
		"suppliers": len(ctx.get("suppliers") or []),
		"items_sales": len(ctx.get("items_sales") or []),
		"items_purchase": len(ctx.get("items_purchase") or []),
	}


def _items_for_company(company: str, sales: bool, stock_only: bool) -> list[dict]:
	join_table = "`tabSales Invoice Item`" if sales else "`tabPurchase Invoice Item`"
	parent = "`tabSales Invoice`" if sales else "`tabPurchase Invoice`"
	stock_clause = "and i.is_stock_item=1" if stock_only else ""
	sales_clause = "i.is_sales_item=1" if sales else "i.is_purchase_item=1"
	rows = frappe.db.sql(
		f"""
		select i.name as item_code, i.item_name, i.is_stock_item, i.stock_uom,
			coalesce(
				(select price_list_rate from `tabItem Price` ip
				 where ip.item_code=i.name and ip.selling=%s
				 order by ip.modified desc limit 1),
				(select avg(sii.rate) from {join_table} sii
				 join {parent} si on si.name=sii.parent
				 where si.company=%s and sii.item_code=i.name and si.docstatus=1 and sii.rate>0),
				100
			) as rate
		from tabItem i
		where i.disabled=0
		  and {sales_clause}
		  and exists (
			select 1 from {join_table} sii
			join {parent} si on si.name=sii.parent
			where si.company=%s and sii.item_code=i.name
		  )
		  {stock_clause}
		order by i.modified desc
		limit 16
		""",
		(1 if sales else 0, company, company),
		as_dict=True,
	)
	if rows:
		return rows
	filters: dict = {"disabled": 0}
	if sales:
		filters["is_sales_item"] = 1
	else:
		filters["is_purchase_item"] = 1
	if stock_only:
		filters["is_stock_item"] = 1
	generic = frappe.get_all(
		"Item",
		filters=filters,
		fields=["name as item_code", "item_name", "is_stock_item", "stock_uom"],
		limit_page_length=12,
	)
	for g in generic:
		g["rate"] = 100
	return generic


def _top_up_stock(ctx: dict) -> None:
	if not ctx.get("warehouse"):
		return
	stock_items = [
		i
		for i in (ctx.get("items_sales") or []) + (ctx.get("items_purchase") or [])
		if cint(i.is_stock_item)
	]
	seen: set[str] = set()
	rows = []
	for item in stock_items:
		code = item.item_code
		if code in seen:
			continue
		seen.add(code)
		qty = flt(
			frappe.db.get_value("Bin", {"item_code": code, "warehouse": ctx["warehouse"]}, "actual_qty")
			or 0
		)
		if qty >= 80:
			continue
		rows.append(
			{
				"item_code": code,
				"qty": 150,
				"basic_rate": max(flt(item.rate) * 0.55, 5),
				"t_warehouse": ctx["warehouse"],
				"uom": item.stock_uom or "Nos",
				"conversion_factor": 1,
				"transfer_qty": 150,
			}
		)
	if not rows:
		return
	se = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"purpose": "Material Receipt",
			"company": ctx["company"],
			"posting_date": frappe.utils.today(),
			"posting_time": "08:30:00",
			"set_posting_time": 1,
			"items": rows,
		}
	)
	try:
		se.insert(ignore_permissions=True)
		se.submit()
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title=f"flow stock top-up {ctx['company']}", message=frappe.get_traceback())


def _seed_company(ctx: dict, months: list[date], force: bool = False) -> dict:
	profile = ctx["profile"]
	out = {
		"quotations": 0,
		"sales_orders": 0,
		"delivery_notes": 0,
		"sales_invoices": 0,
		"purchase_orders": 0,
		"purchase_receipts": 0,
		"purchase_invoices": 0,
		"skipped": 0,
	}

	for month_start in months:
		for n in range(int(profile["sales_per_month"])):
			marker = _marker(ctx["abbr"], month_start, f"S{n}")
			if not force and _marker_exists(ctx["company"], marker):
				out["skipped"] += 1
				continue
			day = min(5 + n * 6, monthrange(month_start.year, month_start.month)[1])
			txn = date(month_start.year, month_start.month, day)
			counts = _create_sales_chain(ctx, txn, n, marker)
			for k, v in counts.items():
				out[k] = out.get(k, 0) + v

	for month_start in months:
		for n in range(int(profile["purchase_per_month"])):
			marker = _marker(ctx["abbr"], month_start, f"P{n}")
			if not force and _marker_exists(ctx["company"], marker):
				out["skipped"] += 1
				continue
			day = min(4 + n * 8, monthrange(month_start.year, month_start.month)[1])
			txn = date(month_start.year, month_start.month, day)
			counts = _create_purchase_chain(ctx, txn, n, marker)
			for k, v in counts.items():
				out[k] = out.get(k, 0) + v

	out["totals"] = {
		"Quotation": frappe.db.count("Quotation", {"company": ctx["company"], "docstatus": 1}),
		"Sales Order": frappe.db.count("Sales Order", {"company": ctx["company"], "docstatus": 1}),
		"Delivery Note": frappe.db.count("Delivery Note", {"company": ctx["company"], "docstatus": 1}),
		"Sales Invoice": frappe.db.count("Sales Invoice", {"company": ctx["company"], "docstatus": 1}),
		"Purchase Order": frappe.db.count("Purchase Order", {"company": ctx["company"], "docstatus": 1}),
		"Purchase Receipt": frappe.db.count("Purchase Receipt", {"company": ctx["company"], "docstatus": 1}),
		"Purchase Invoice": frappe.db.count("Purchase Invoice", {"company": ctx["company"], "docstatus": 1}),
	}
	return out


def _marker(abbr: str, month_start: date, seq: str) -> str:
	return f"{FLOW_MARKER}-{abbr}-{month_start.strftime('%Y%m')}-{seq}"


def _marker_exists(company: str, marker: str) -> bool:
	"""True when SO/PO for this marker exists (incomplete QTN-only rows are resumed)."""
	if frappe.db.exists("Sales Order", {"company": company, "po_no": marker, "docstatus": ["<", 2]}):
		return True
	if frappe.db.exists(
		"Purchase Order", {"company": company, "inter_company_order_reference": marker, "docstatus": ["<", 2]}
	):
		return True
	if frappe.db.exists("Purchase Order", {"company": company, "title": marker, "docstatus": ["<", 2]}):
		return True
	return False


def _quotation_valid_till(txn: date) -> str:
	"""Keep quotation orderable today even when transaction_date is backdated."""
	floor = add_days(getdate(frappe.utils.today()), 60)
	natural = add_days(txn, 45)
	return (floor if getdate(floor) > getdate(natural) else getdate(natural)).isoformat()


def _extend_quotation_validity(quotation_name: str) -> None:
	frappe.db.set_value(
		"Quotation",
		quotation_name,
		"valid_till",
		add_days(frappe.utils.today(), 60),
		update_modified=False,
	)
	frappe.db.commit()


def _party_emirate(customer: str) -> str:
	addr = frappe.db.get_value(
		"Dynamic Link",
		{"link_doctype": "Customer", "link_name": customer, "parenttype": "Address"},
		"parent",
	)
	if addr:
		state = frappe.db.get_value("Address", addr, "state")
		if state:
			return state
	return "Dubai"


def _sales_lines(ctx: dict, n: int, delivery_date: date) -> list[dict]:
	items = ctx["items_sales"]
	a = items[n % len(items)]
	b = items[(n + 2) % len(items)]
	use_stock = bool(ctx["profile"].get("use_delivery"))
	if ctx["profile"].get("kind") == "services" or not use_stock:
		return [
			{
				"item_code": a.item_code,
				"qty": 1,
				"rate": max(flt(a.rate), 250),
				"delivery_date": delivery_date.isoformat(),
			}
		]
	qty_a = 2 + (n % 3)
	lines = [
		{
			"item_code": a.item_code,
			"qty": qty_a,
			"rate": max(flt(a.rate), 15),
			"delivery_date": delivery_date.isoformat(),
			"warehouse": ctx["warehouse"],
		}
	]
	if a.item_code != b.item_code and n % 2 == 0:
		lines.append(
			{
				"item_code": b.item_code,
				"qty": 1 + (n % 2),
				"rate": max(flt(b.rate), 15),
				"delivery_date": delivery_date.isoformat(),
				"warehouse": ctx["warehouse"],
			}
		)
	return lines


def _purchase_lines(ctx: dict, n: int, schedule_date: date) -> list[dict]:
	items = ctx["items_purchase"] or ctx["items_sales"]
	item = items[n % len(items)]
	qty = 8 + n * 2 if cint(item.is_stock_item) else 1
	rate = max(flt(item.rate) * (0.6 if cint(item.is_stock_item) else 1), 10)
	line = {
		"item_code": item.item_code,
		"qty": qty,
		"rate": rate,
		"schedule_date": schedule_date.isoformat(),
	}
	if ctx.get("warehouse") and cint(item.is_stock_item):
		line["warehouse"] = ctx["warehouse"]
	return [line]


def _repair_incomplete_flows(ctx: dict) -> dict:
	"""Finish FLOW-* sales orders that stopped after SO (missing DN/SI)."""
	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note, make_sales_invoice

	out = {"delivery_notes": 0, "sales_invoices": 0}
	# Backfill SO.po_no from Quotation.title for earlier FLOW seed attempts
	frappe.db.sql(
		"""
		update `tabSales Order` so
		inner join `tabSales Order Item` soi on soi.parent=so.name and soi.idx=1
		inner join `tabQuotation` q on q.name=soi.prevdoc_docname
		set so.po_no=q.title
		where so.company=%s
		  and ifnull(so.po_no,'')=''
		  and q.title like %s
		""",
		(ctx["company"], f"{FLOW_MARKER}-%"),
	)
	frappe.db.commit()

	orders = frappe.get_all(
		"Sales Order",
		filters={
			"company": ctx["company"],
			"docstatus": 1,
			"po_no": ["like", f"{FLOW_MARKER}-%"],
			"status": ["!=", "Closed"],
		},
		fields=["name", "customer", "transaction_date", "per_delivered", "per_billed", "po_no"],
		limit_page_length=80,
	)
	for so in orders:
		dn_name = None
		# Deliver remaining stock lines
		if flt(so.per_delivered) < 99.99:
			try:
				so_doc = frappe.get_doc("Sales Order", so.name)
				lines = [
					{"item_code": i.item_code, "qty": i.qty, "rate": i.rate}
					for i in so_doc.items
					if cint(frappe.db.get_value("Item", i.item_code, "is_stock_item"))
				]
				if lines and ctx["profile"].get("use_delivery"):
					dn_posting = add_days(getdate(so.transaction_date), 5)
					_ensure_stock_for_lines(ctx, lines, dn_posting)
					dn = make_delivery_note(so.name)
					if dn.get("items"):
						dn.status = "Draft"
						dn.set_posting_time = 1
						dn.posting_date = getdate(dn_posting).isoformat()
						dn.posting_time = "14:30:00"
						dn.set_warehouse = ctx["warehouse"]
						dn.po_no = so_doc.po_no
						if dn.meta.has_field("vat_emirate"):
							dn.vat_emirate = _party_emirate(so.customer)
						for item in dn.items:
							if ctx.get("warehouse"):
								item.warehouse = ctx["warehouse"]
						dn.insert(ignore_permissions=True)
						dn.submit()
						frappe.db.commit()
						out["delivery_notes"] += 1
						dn_name = dn.name
			except Exception:
				frappe.db.rollback()
				frappe.log_error(title=f"flow repair DN {so.name}", message=frappe.get_traceback())

		if flt(so.per_billed) >= 99.99:
			continue
		# Keep a small share intentionally unbilled for demo pipeline
		if hash(so.name) % 5 == 4:
			continue
		try:
			if dn_name:
				from erpnext.stock.doctype.delivery_note.delivery_note import (
					make_sales_invoice as make_si_from_dn,
				)

				si = make_si_from_dn(dn_name)
				posting = add_days(getdate(so.transaction_date), 6)
			else:
				existing_dn = frappe.db.get_value(
					"Delivery Note Item",
					{"against_sales_order": so.name, "docstatus": 1},
					"parent",
				)
				if existing_dn and flt(so.per_delivered) >= 99.99:
					from erpnext.stock.doctype.delivery_note.delivery_note import (
						make_sales_invoice as make_si_from_dn,
					)

					si = make_si_from_dn(existing_dn)
				else:
					si = make_sales_invoice(so.name)
				posting = add_days(getdate(so.transaction_date), 6)
			if not si.get("items"):
				continue
			si.status = "Draft"
			si.set_posting_time = 1
			si.posting_date = getdate(posting).isoformat()
			si.posting_time = "11:00:00"
			si.due_date = add_days(posting, 30).isoformat()
			if si.meta.has_field("remarks"):
				si.remarks = so.po_no
			if si.meta.has_field("vat_emirate"):
				si.vat_emirate = _party_emirate(so.customer)
			si.insert(ignore_permissions=True)
			si.submit()
			frappe.db.commit()
			out["sales_invoices"] += 1
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"flow repair SI {so.name}", message=frappe.get_traceback())
	return out


def _ensure_stock_for_lines(ctx: dict, lines: list[dict], posting_date: date | str) -> None:
	"""Receive enough stock dated before fulfilment so DN/PR never goes negative."""
	if not ctx.get("warehouse"):
		return
	rows = []
	for ln in lines:
		code = ln.get("item_code")
		if not code or not cint(frappe.db.get_value("Item", code, "is_stock_item")):
			continue
		need = flt(ln.get("qty") or 0) + 20
		qty = flt(
			frappe.db.get_value("Bin", {"item_code": code, "warehouse": ctx["warehouse"]}, "actual_qty") or 0
		)
		if qty >= need:
			continue
		rows.append(
			{
				"item_code": code,
				"qty": max(need - qty, 50),
				"basic_rate": max(flt(ln.get("rate")) * 0.5, 5),
				"t_warehouse": ctx["warehouse"],
				"uom": frappe.db.get_value("Item", code, "stock_uom") or "Nos",
				"conversion_factor": 1,
				"transfer_qty": max(need - qty, 50),
			}
		)
	if not rows:
		return
	se = frappe.get_doc(
		{
			"doctype": "Stock Entry",
			"stock_entry_type": "Material Receipt",
			"purpose": "Material Receipt",
			"company": ctx["company"],
			"posting_date": add_days(getdate(posting_date), -2).isoformat(),
			"posting_time": "08:00:00",
			"set_posting_time": 1,
			"items": rows,
		}
	)
	try:
		se.insert(ignore_permissions=True)
		se.submit()
		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title=f"flow stock ensure {ctx['company']}", message=frappe.get_traceback())


def _create_sales_chain(ctx: dict, txn: date, n: int, marker: str) -> dict:
	from erpnext.selling.doctype.quotation.quotation import make_sales_order
	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note, make_sales_invoice

	counts = {"quotations": 0, "sales_orders": 0, "delivery_notes": 0, "sales_invoices": 0}
	customer = ctx["customers"][n % len(ctx["customers"])]
	delivery = add_days(txn, 7 + (n % 5))
	lines = _sales_lines(ctx, n, getdate(delivery))

	existing_qtn = frappe.db.get_value(
		"Quotation",
		{"company": ctx["company"], "title": marker, "docstatus": 1},
		"name",
	)
	if existing_qtn:
		qtn_name = existing_qtn
		_extend_quotation_validity(qtn_name)
	else:
		qtn = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": customer,
				"order_type": "Sales",
				"status": "Draft",
				"transaction_date": txn.isoformat(),
				"valid_till": _quotation_valid_till(txn),
				"company": ctx["company"],
				"currency": ctx["currency"],
				"conversion_rate": 1,
				"selling_price_list": "Standard Selling",
				"price_list_currency": ctx["currency"],
				"plc_conversion_rate": 1,
				"taxes_and_charges": ctx["sales_tax"],
				"title": marker,
				"items": [
					{"item_code": ln["item_code"], "qty": ln["qty"], "rate": ln["rate"]} for ln in lines
				],
			}
		)
		if qtn.meta.has_field("vat_emirate"):
			qtn.vat_emirate = _party_emirate(customer)
		if not _safe_submit(qtn):
			return counts
		counts["quotations"] = 1
		qtn_name = qtn.name
		# ERPNext may rewrite title on submit — pin the FLOW marker back
		frappe.db.set_value("Quotation", qtn_name, "title", marker, update_modified=False)
		_extend_quotation_validity(qtn_name)

	try:
		so = make_sales_order(qtn_name)
		so.status = "Draft"
		so.transaction_date = txn.isoformat()
		so.delivery_date = getdate(delivery).isoformat()
		so.po_no = marker
		if so.meta.has_field("vat_emirate") and not so.get("vat_emirate"):
			so.vat_emirate = _party_emirate(customer)
		for item in so.items:
			if not item.delivery_date:
				item.delivery_date = getdate(delivery).isoformat()
			if ctx.get("warehouse") and cint(frappe.db.get_value("Item", item.item_code, "is_stock_item")):
				item.warehouse = ctx["warehouse"]
		so.insert(ignore_permissions=True)
		so.submit()
		frappe.db.commit()
		counts["sales_orders"] = 1
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title=f"flow SO {marker}", message=frappe.get_traceback())
		return counts

	# Leave ~25% of orders open (quoted + ordered only) for pipeline realism
	if n % 4 == 3:
		return counts

	use_delivery = bool(ctx["profile"].get("use_delivery")) and any(
		cint(frappe.db.get_value("Item", ln["item_code"], "is_stock_item")) for ln in lines
	)

	dn_name = None
	dn_posting = add_days(txn, 5 + (n % 3))
	if use_delivery:
		_ensure_stock_for_lines(ctx, lines, dn_posting)
		try:
			dn = make_delivery_note(so.name)
			if not dn.get("items"):
				use_delivery = False
			else:
				dn.status = "Draft"
				dn.set_posting_time = 1
				dn.posting_date = getdate(dn_posting).isoformat()
				dn.posting_time = "14:30:00"
				dn.set_warehouse = ctx["warehouse"]
				dn.po_no = marker
				if dn.meta.has_field("vat_emirate") and not dn.get("vat_emirate"):
					dn.vat_emirate = _party_emirate(customer)
				for item in dn.items:
					if ctx.get("warehouse"):
						item.warehouse = ctx["warehouse"]
				dn.insert(ignore_permissions=True)
				dn.submit()
				frappe.db.commit()
				counts["delivery_notes"] = 1
				dn_name = dn.name
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"flow DN {marker}", message=frappe.get_traceback())
			use_delivery = False

	# Leave ~20% delivered but unbilled
	if n % 5 == 4 and dn_name:
		return counts

	try:
		if dn_name:
			from erpnext.stock.doctype.delivery_note.delivery_note import (
				make_sales_invoice as make_si_from_dn,
			)

			si = make_si_from_dn(dn_name)
			posting = add_days(dn_posting, 1)
		else:
			si = make_sales_invoice(so.name)
			posting = add_days(txn, 6)
		if not si.get("items"):
			return counts
		si.status = "Draft"
		si.set_posting_time = 1
		si.posting_date = getdate(posting).isoformat()
		si.posting_time = "11:00:00"
		si.due_date = add_days(posting, 30).isoformat()
		if si.meta.has_field("remarks"):
			si.remarks = marker
		if si.meta.has_field("vat_emirate") and not si.get("vat_emirate"):
			si.vat_emirate = _party_emirate(customer)
		si.insert(ignore_permissions=True)
		si.submit()
		frappe.db.commit()
		counts["sales_invoices"] = 1
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title=f"flow SI {marker}", message=frappe.get_traceback())
	return counts


def _create_purchase_chain(ctx: dict, txn: date, n: int, marker: str) -> dict:
	from erpnext.buying.doctype.purchase_order.purchase_order import (
		make_purchase_invoice,
		make_purchase_receipt,
	)

	counts = {"purchase_orders": 0, "purchase_receipts": 0, "purchase_invoices": 0}
	if not ctx.get("suppliers"):
		return counts
	supplier = ctx["suppliers"][n % len(ctx["suppliers"])]
	schedule = add_days(txn, 10)
	lines = _purchase_lines(ctx, n, getdate(schedule))

	po = frappe.get_doc(
		{
			"doctype": "Purchase Order",
			"company": ctx["company"],
			"supplier": supplier,
			"status": "Draft",
			"transaction_date": txn.isoformat(),
			"schedule_date": getdate(schedule).isoformat(),
			"currency": ctx["currency"],
			"conversion_rate": 1,
			"buying_price_list": "Standard Buying",
			"price_list_currency": ctx["currency"],
			"plc_conversion_rate": 1,
			"taxes_and_charges": ctx["purchase_tax"],
			"title": marker,
			"inter_company_order_reference": marker,
			"items": lines,
		}
	)
	if not _safe_submit(po):
		return counts
	counts["purchase_orders"] = 1
	frappe.db.set_value("Purchase Order", po.name, "title", marker, update_modified=False)
	frappe.db.set_value(
		"Purchase Order", po.name, "inter_company_order_reference", marker, update_modified=False
	)
	frappe.db.commit()

	if n % 4 == 3:
		return counts

	use_receipt = bool(ctx["profile"].get("use_receipt")) and any(
		cint(frappe.db.get_value("Item", ln["item_code"], "is_stock_item")) for ln in lines
	)

	pr_name = None
	pr_posting = add_days(txn, 4 + (n % 3))
	if use_receipt:
		try:
			pr = make_purchase_receipt(po.name)
			if not pr.get("items"):
				use_receipt = False
			else:
				pr.set_posting_time = 1
				pr.posting_date = getdate(pr_posting).isoformat()
				pr.posting_time = "12:15:00"
				pr.set_warehouse = ctx["warehouse"]
				if pr.meta.has_field("supplier_delivery_note"):
					pr.supplier_delivery_note = marker
				if pr.meta.has_field("title"):
					pr.title = marker
				pr.insert(ignore_permissions=True)
				pr.submit()
				frappe.db.commit()
				counts["purchase_receipts"] = 1
				pr_name = pr.name
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"flow PR {marker}", message=frappe.get_traceback())
			use_receipt = False

	if n % 5 == 4 and pr_name:
		return counts

	try:
		if pr_name:
			from erpnext.stock.doctype.purchase_receipt.purchase_receipt import (
				make_purchase_invoice as make_pi_from_pr,
			)

			pi = make_pi_from_pr(pr_name)
			posting = add_days(pr_posting, 1)
		else:
			pi = make_purchase_invoice(po.name)
			posting = add_days(txn, 5)
		if not pi.get("items"):
			return counts
		pi.set_posting_time = 1
		pi.posting_date = getdate(posting).isoformat()
		pi.posting_time = "10:45:00"
		pi.due_date = add_days(posting, 21).isoformat()
		pi.bill_no = f"SUP-{marker[-8:]}"
		pi.bill_date = getdate(posting).isoformat()
		pi.remarks = marker
		pi.insert(ignore_permissions=True)
		pi.submit()
		frappe.db.commit()
		counts["purchase_invoices"] = 1
	except Exception:
		frappe.db.rollback()
		frappe.log_error(title=f"flow PI {marker}", message=frappe.get_traceback())
	return counts


def _safe_submit(doc) -> bool:
	try:
		doc.insert(ignore_permissions=True)
		doc.submit()
		frappe.db.commit()
		return True
	except Exception:
		try:
			frappe.log_error(title=f"flow {getattr(doc, 'doctype', '?')}", message=frappe.get_traceback())
		except Exception:
			pass
		frappe.db.rollback()
		return False
