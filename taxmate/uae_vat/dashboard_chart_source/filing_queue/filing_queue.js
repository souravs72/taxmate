frappe.provide("frappe.dashboards.chart_sources");

frappe.dashboards.chart_sources["Filing Queue"] = {
	method: "taxmate.uae_vat.dashboard_chart_source.filing_queue.filing_queue.get",
	filters: [
		{
			fieldname: "company",
			label: __("Company"),
			fieldtype: "Link",
			options: "Company",
			default: frappe.defaults.get_user_default("Company"),
			reqd: 1,
		},
	],
};
