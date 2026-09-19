// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.query_reports["EmaraTax Export"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			reqd: 1,
			default: frappe.defaults.get_user_default("Company"),
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.month_start(),
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.month_end(),
		},
		{
			fieldname: "box_6_amount",
			label: __("Box 6: Goods Imported — Amount (AED)"),
			fieldtype: "Currency",
		},
		{
			fieldname: "box_6_vat_amount",
			label: __("Box 6: Goods Imported — VAT (AED)"),
			fieldtype: "Currency",
		},
		{
			fieldname: "box_7_amount",
			label: __("Box 7: Import Adjustments — Amount (AED)"),
			fieldtype: "Currency",
		},
		{
			fieldname: "box_7_vat_amount",
			label: __("Box 7: Import Adjustments — VAT (AED)"),
			fieldtype: "Currency",
		},
	],

	onload(report) {
		report.page.add_inner_button(__("Save as Filing Log"), () => {
			const values = report.get_values();
			if (!values.company || !values.from_date || !values.to_date) {
				frappe.msgprint(__("Set Company, From Date and To Date first."));
				return;
			}
			frappe.call({
				method: "taxmate.uae_vat.doctype.uae_vat_201_filing_log.uae_vat_201_filing_log.get_or_create",
				args: {
					company: values.company,
					period_start: values.from_date,
					period_end: values.to_date,
				},
				freeze: true,
				callback(r) {
					if (!r.exc && r.message) {
						frappe.set_route("Form", "UAE VAT 201 Filing Log", r.message);
					}
				},
			});
		});
	},
};
