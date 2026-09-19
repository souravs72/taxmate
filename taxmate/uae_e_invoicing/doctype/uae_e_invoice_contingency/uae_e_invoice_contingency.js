// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE E-Invoice Contingency", {
	refresh(frm) {
		if (
			frm.doc.status === "Open" &&
			frm.doc.report_due &&
			frm.doc.report_due < frappe.datetime.get_today() &&
			!frm.doc.reported_to_fta
		) {
			frm.dashboard.set_headline_alert(
				__("Report this downtime to the FTA — due {0}", [frm.doc.report_due]),
				"red"
			);
		}
	},
});
