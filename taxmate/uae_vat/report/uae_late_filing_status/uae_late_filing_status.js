// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.query_reports["UAE Late Filing Status"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
		},
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: "\nDue\nOverdue\nCleared",
			default: "Overdue",
		},
	],
};
