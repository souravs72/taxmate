frappe.provide("frappe.dashboards.chart_sources");

frappe.dashboards.chart_sources["VAT 201 Net Due"] = {
	method: "taxmate.uae_vat.dashboard_chart_source.vat_201_net_due.vat_201_net_due.get",
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
