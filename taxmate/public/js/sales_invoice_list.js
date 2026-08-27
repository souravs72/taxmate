// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.listview_settings["Sales Invoice"] = frappe.listview_settings["Sales Invoice"] || {};

const taxmate_si_list = frappe.listview_settings["Sales Invoice"];
const previous_onload = taxmate_si_list.onload;

taxmate_si_list.onload = function (listview) {
	if (previous_onload) {
		previous_onload(listview);
	}

	listview.page.add_action_item(__("Submit UAE E-Invoices"), () => {
		const docnames = listview.get_checked_items(true);
		if (!docnames.length) {
			frappe.msgprint(__("Select at least one invoice."));
			return;
		}
		frappe.call({
			method: "taxmate.uae_e_invoicing.utils.e_invoice.bulk_generate_e_invoices",
			args: { docnames: docnames, doctype: "Sales Invoice" },
			freeze: true,
			freeze_message: __("Submitting UAE e-invoices..."),
			callback(r) {
				if (r.exc || !r.message) {
					return;
				}
				const { submitted, skipped, failed } = r.message;
				frappe.msgprint(
					__("Submitted: {0} · Skipped: {1} · Failed: {2}", [
						submitted.length,
						skipped.length,
						failed.length,
					]),
					__("UAE E-Invoice Bulk Submit")
				);
				listview.refresh();
			},
		});
	});
};
