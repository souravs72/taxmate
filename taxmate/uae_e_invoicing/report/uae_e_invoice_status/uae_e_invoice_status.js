// Copyright (c) 2026, Sourav Singh and contributors
frappe.query_reports["UAE E-Invoice Status"] = {
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
			options: "\nDraft\nGenerated\nQueued\nSubmitted\nAccepted\nRejected\nFailed",
		},
	],
};
