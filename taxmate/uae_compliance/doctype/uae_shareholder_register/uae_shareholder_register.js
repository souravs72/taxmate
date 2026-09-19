// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE Shareholder Register", {
	refresh(frm) {
		if (frm.is_new()) return;

		if (frm.doc.status === "Empty") {
			frm.dashboard.add_comment(
				__(
					"Legal ownership is empty. This is the Register of Partners / Shareholders (Cabinet Decision 109), not the UBO register."
				),
				"orange",
				true
			);
		} else {
			frm.dashboard.add_comment(__("Legal ownership: {0}", [frm.doc.status]), "green", true);
		}
	},
});
