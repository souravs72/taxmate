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
};
