// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE Late Filing Notice", {
	refresh(frm) {
		frm.dashboard.set_headline_alert(
			__("Status reminder only. TaxMate does not calculate FTA penalties."),
			frm.doc.status === "Overdue" ? "red" : "orange"
		);
	},
});
