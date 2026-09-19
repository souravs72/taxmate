// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.query_reports["UAE Compliance Status"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
		},
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (!data) {
			return value;
		}
		if (column.fieldname === "registers_complete" && data.registers_complete === __("No")) {
			return `<span class="indicator-pill red">${value}</span>`;
		}
		if (column.fieldname === "shareholder_status" && data.shareholder_status === "No Register") {
			return `<span class="indicator-pill orange">${value}</span>`;
		}
		return value;
	},
};
