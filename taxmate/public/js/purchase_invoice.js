// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("Purchase Invoice", {
	refresh(frm) {
		if (frm.doc.docstatus !== 1 || !frm.doc.uae_submit_to_fta) {
			return;
		}

		taxmate.e_invoice.render_status_banner(frm);

		const status = frm.doc.uae_e_invoice_status;
		if (!status || ["Failed", "Rejected"].includes(status)) {
			frm.add_custom_button(
				__("Generate & Submit (Self-Billed)"),
				() => taxmate.e_invoice.generate(frm, "Purchase Invoice"),
				__("UAE E-Invoice")
			);
		}
		taxmate.e_invoice.add_common_buttons(frm);
	},
});
