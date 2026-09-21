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
		{
			fieldname: "sla",
			label: __("SLA"),
			fieldtype: "Select",
			options: "\nOpen\nMet\nLate\nBreached",
		},
	],

	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname === "sla" && data) {
			const color = { Breached: "red", Late: "orange", Met: "green", Open: "blue" }[
				data.sla
			];
			if (color) {
				return `<span class="indicator-pill ${color}">${value}</span>`;
			}
		}
		return value;
	},
};
