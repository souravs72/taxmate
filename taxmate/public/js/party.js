// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

// Peppol directory verification for Customer / Supplier.

(function () {
	function add_verify_button(frm) {
		if (!frm.doc.uae_peppol_id || frm.is_new()) {
			return;
		}
		frm.add_custom_button(
			__("Verify Peppol ID"),
			() => {
				frappe.call({
					method: "taxmate.uae_e_invoicing.utils.participant.lookup_peppol_participant",
					args: { peppol_id: frm.doc.uae_peppol_id },
					freeze: true,
					freeze_message: __("Looking up the Peppol directory..."),
					callback(r) {
						if (!r.message) {
							return;
						}
						const registered = r.message.registered !== false;
						frappe.msgprint({
							title: __("Peppol Directory"),
							indicator: registered ? "green" : "red",
							message: `<pre>${frappe.utils.escape_html(
								JSON.stringify(r.message, null, 2)
							)}</pre>`,
						});
					},
				});
			},
			__("UAE E-Invoice")
		);
	}

	frappe.ui.form.on("Customer", { refresh: add_verify_button });
	frappe.ui.form.on("Supplier", { refresh: add_verify_button });
})();
