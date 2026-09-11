// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

const ESR_STATUS_INDICATOR = {
	"Not Started": "gray",
	"Notification Due": "orange",
	"Notification Filed": "blue",
	"Report Due": "orange",
	Complete: "green",
	Overdue: "red",
};

frappe.ui.form.on("UAE ESR Filing", {
	refresh(frm) {
		if (frm.is_new()) return;

		const indicator = ESR_STATUS_INDICATOR[frm.doc.status] || "gray";
		frm.dashboard.add_comment(__("Status: {0}", [frm.doc.status]), indicator, true);

		if (frm.doc.docstatus === 1) {
			frm.dashboard.set_headline_alert(
				__("Submitted — locked as the audit record. Cancel and Amend to correct it."),
				"green"
			);
		} else if (frm.doc.docstatus === 2) {
			frm.dashboard.set_headline_alert(__("Cancelled. Amend to create a corrected copy."), "red");
		} else if (frm.doc.status === "Overdue") {
			frm.dashboard.set_headline_alert(
				__("This ESR filing is past a deadline. File through your regulatory authority's portal, then record the date here."),
				"red"
			);
		} else if (frm.doc.status === "Complete") {
			frm.dashboard.set_headline_alert(
				__("Everything required is filed. Submit this record to lock it in as your audit trail."),
				"blue"
			);
		}
	},
});
