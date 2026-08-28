// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

/* global taxmate */

// Shared UAE e-invoice helpers for Sales / Purchase Invoice forms.

frappe.provide("taxmate.e_invoice");

taxmate.e_invoice.STATUS_COLORS = {
	Queued: "orange",
	Generated: "blue",
	Submitted: "blue",
	Accepted: "green",
	Rejected: "red",
	Failed: "red",
	Cancelled: "gray",
};

taxmate.e_invoice.render_status_banner = function (frm) {
	const status = frm.doc.uae_e_invoice_status;
	if (!status) {
		return;
	}
	const color = taxmate.e_invoice.STATUS_COLORS[status] || "gray";
	frm.dashboard.clear_headline();
	frm.dashboard.set_headline(
		`${__("UAE E-Invoice")}: <span class="indicator-pill ${color}">${__(status)}</span>`
	);
};

taxmate.e_invoice.generate = function (frm, doctype) {
	frappe.call({
		method: "taxmate.uae_e_invoicing.utils.e_invoice.generate_e_invoice",
		args: { docname: frm.doc.name, doctype: doctype },
		freeze: true,
		freeze_message: __("Generating and submitting UAE e-invoice..."),
		callback(r) {
			if (!r.exc) {
				frm.reload_doc();
			}
		},
	});
};

taxmate.e_invoice.refresh_status = function (frm) {
	frappe.call({
		method: "taxmate.uae_e_invoicing.utils.e_invoice.sync_status_from_asp",
		args: { log_name: frm.doc.uae_e_invoice_log },
		freeze: true,
		freeze_message: __("Checking status with the ASP..."),
		callback(r) {
			if (r.message) {
				frappe.show_alert({
					message: __("E-invoice status: {0}", [__(r.message)]),
					indicator: "green",
				});
			} else {
				frappe.show_alert({
					message: __("No status update available from the ASP yet."),
					indicator: "orange",
				});
			}
			frm.reload_doc();
		},
	});
};

taxmate.e_invoice.add_common_buttons = function (frm) {
	const status = frm.doc.uae_e_invoice_status;
	if (!frm.doc.uae_e_invoice_log) {
		return;
	}

	frm.add_custom_button(
		__("Open E-Invoice Log"),
		() => {
			frappe.set_route("Form", "UAE E-Invoice Log", frm.doc.uae_e_invoice_log);
		},
		__("UAE E-Invoice")
	);

	if (status === "Submitted") {
		frm.add_custom_button(
			__("Refresh Status"),
			() => taxmate.e_invoice.refresh_status(frm),
			__("UAE E-Invoice")
		);
	}

	if (status === "Accepted") {
		frm.add_custom_button(
			__("Fetch Signed XML / PDF"),
			() => {
				frappe.call({
					method: "taxmate.uae_e_invoicing.utils.e_invoice.fetch_asp_documents",
					args: { log_name: frm.doc.uae_e_invoice_log },
					freeze: true,
					callback() {
						frappe.show_alert({
							message: __("Fetching signed documents from the ASP..."),
							indicator: "blue",
						});
						setTimeout(() => frm.reload_doc(), 2000);
					},
				});
			},
			__("UAE E-Invoice")
		);
	}
};
