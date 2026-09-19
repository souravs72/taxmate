// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE Excise Filing Log", {
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.dashboard.set_headline_alert(
				__("Submitted as the audit record. This does not file the Excise Tax Return."),
				"green"
			);
		} else if (frm.doc.docstatus === 0 && !frm.is_new()) {
			frm.add_custom_button(__("Generate from Sales Invoices"), () => {
				frappe.call({
					doc: frm.doc,
					method: "generate",
					freeze: true,
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({ message: __("Excise lines generated."), indicator: "green" });
							frm.reload_doc();
						}
					},
				});
			});
		}
	},
});
