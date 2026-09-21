// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE FTA Audit Pack", {
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.dashboard.set_headline_alert(
				__("Submitted audit pack. This zip is a backup — it does not file with the FTA."),
				"green"
			);
		} else if (frm.doc.docstatus === 0 && !frm.is_new()) {
			frm.add_custom_button(__("Export Audit Zip"), () => {
				frappe.call({
					doc: frm.doc,
					method: "generate",
					freeze: true,
					freeze_message: __("Building FTA audit zip..."),
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Audit zip attached."),
								indicator: "green",
							});
							frm.reload_doc();
						}
					},
				});
			});
		}
	},
});
