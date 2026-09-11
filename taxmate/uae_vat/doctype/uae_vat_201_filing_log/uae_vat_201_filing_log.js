// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE VAT 201 Filing Log", {
	setup(frm) {
		frm.set_query("vat_group", () => ({
			filters: { docstatus: 1, representative_company: frm.doc.company },
		}));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.dashboard.set_headline_alert(
				__("Filed (submitted) on {0} by {1}. Cancel and Amend to correct a filed return — don't edit it in place.", [
					frappe.datetime.str_to_user(frm.doc.filed_on),
					frm.doc.filed_by,
				]),
				"green"
			);
		} else if (frm.doc.docstatus === 2) {
			frm.dashboard.set_headline_alert(__("Cancelled. Amend to create a corrected copy."), "red");
		} else {
			frm.dashboard.set_headline_alert(
				__(
					"This is a worksheet to review before you submit it (marking it Filed) — submitting does not itself send anything to EmaraTax; file through the portal, then submit this as your audit record."
				),
				"orange"
			);
		}

		if (frm.doc.docstatus === 0 && !frm.is_new()) {
			frm.add_custom_button(__("Generate / Refresh Boxes"), () => {
				frappe.call({
					doc: frm.doc,
					method: "generate",
					freeze: true,
					freeze_message: __("Computing VAT 201 boxes..."),
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({ message: __("Boxes generated."), indicator: "green" });
							frm.reload_doc();
						}
					},
				});
			});
		}

		if (!frm.is_new()) {
			frm.add_custom_button(__("Export Accountant Pack"), () => {
				frappe.call({
					doc: frm.doc,
					method: "export_accountant_pack",
					freeze: true,
					freeze_message: __("Building accountant pack..."),
					callback(r) {
						if (!r.exc && r.message) {
							frappe.msgprint({
								title: __("Accountant Pack"),
								indicator: "green",
								message: `${r.message.message || ""}<br><br><span class="text-muted">${
									r.message.emaratax_api || ""
								}</span>`,
							});
							frm.reload_doc();
						}
					},
				});
			});
		}

		if (frm.doc.docstatus === 0 && (!frm.doc.boxes || !frm.doc.boxes.length)) {
			frm.dashboard.add_comment(
				__("Generate the boxes before you can submit (file) this log."),
				"orange",
				true
			);
		}
	},
	box_6_amount(frm) {
		frm.set_value("boxes_6_7_manual", 1);
	},
	box_6_vat_amount(frm) {
		frm.set_value("boxes_6_7_manual", 1);
	},
	box_7_amount(frm) {
		frm.set_value("boxes_6_7_manual", 1);
	},
	box_7_vat_amount(frm) {
		frm.set_value("boxes_6_7_manual", 1);
	},
});
