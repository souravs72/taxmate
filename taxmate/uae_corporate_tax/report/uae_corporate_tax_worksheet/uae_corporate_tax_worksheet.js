// Copyright (c) 2026, Sourav Singh and contributors
frappe.query_reports["UAE Corporate Tax Worksheet"] = {
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			reqd: 1,
			default: frappe.defaults.get_user_default("Company"),
			on_change() {
				const company = frappe.query_report.get_filter_value("company");
				if (!company) {
					return;
				}
				frappe.call({
					method: "taxmate.uae_corporate_tax.utils.corporate_tax.get_ct_elections",
					args: { company },
					callback(r) {
						if (!r.message) {
							return;
						}
						frappe.query_report.set_filter_value("elect_sbr", r.message.elect_sbr);
						frappe.query_report.set_filter_value("elect_qfzp", r.message.elect_qfzp);
					},
				});
			},
		},
		{
			fieldname: "from_date",
			label: __("Period Start"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.year_start(),
		},
		{
			fieldname: "to_date",
			label: __("Period End"),
			fieldtype: "Date",
			reqd: 1,
			default: frappe.datetime.year_end(),
		},
		{
			fieldname: "elect_sbr",
			label: __("Elect Small Business Relief"),
			fieldtype: "Check",
			default: 0,
		},
		{
			fieldname: "elect_qfzp",
			label: __("Elect QFZP"),
			fieldtype: "Check",
			default: 0,
		},
	],
};
