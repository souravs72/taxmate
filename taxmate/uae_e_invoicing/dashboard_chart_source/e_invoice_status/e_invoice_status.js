frappe.provide("frappe.dashboards.chart_sources");

frappe.dashboards.chart_sources["E-Invoice Status"] = {
	method: "taxmate.uae_e_invoicing.dashboard_chart_source.e_invoice_status.e_invoice_status.get",
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
