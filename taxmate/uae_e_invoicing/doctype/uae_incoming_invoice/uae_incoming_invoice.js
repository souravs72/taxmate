// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE Incoming Invoice", {
	refresh(frm) {
		if (frm.doc.purchase_invoice) {
			frm.add_custom_button(__("Open Purchase Invoice"), () => {
				frappe.set_route("Form", "Purchase Invoice", frm.doc.purchase_invoice);
			});
			return;
		}

		if (frm.doc.status === "Received") {
			frm.add_custom_button(__("Create Purchase Invoice"), () => {
				frappe.call({
					method:
						"taxmate.uae_e_invoicing.doctype.uae_incoming_invoice.uae_incoming_invoice.create_purchase_invoice",
					args: { name: frm.doc.name },
					freeze: true,
					freeze_message: __("Drafting Purchase Invoice..."),
					callback(r) {
						if (!r.exc && r.message) {
							frappe.set_route("Form", "Purchase Invoice", r.message);
						}
					},
				});
			});
		}
	},
});
