// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE CT Filing Log", {
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
					"This is a worksheet to review before you submit it (marking it Filed) — submitting does not itself e-file or send anything to the FTA; file through the portal, then submit this as your audit record."
				),
				"orange"
			);
		}

		if (frm.doc.docstatus === 0 && !frm.is_new()) {
			frm.add_custom_button(__("Generate Worksheet"), () => {
				frappe.call({
					doc: frm.doc,
					method: "generate",
					freeze: true,
					freeze_message: __("Computing Corporate Tax worksheet..."),
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({ message: __("Worksheet generated."), indicator: "green" });
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
									r.message.fta_api || ""
								}</span>`,
							});
							frm.reload_doc();
						}
					},
				});
			});
		}

		if (frm.doc.docstatus === 0 && !frm.doc.generated_on) {
			frm.dashboard.add_comment(
				__("Generate the worksheet before you submit (file) this log."),
				"orange",
				true
			);
		}
	},
});
