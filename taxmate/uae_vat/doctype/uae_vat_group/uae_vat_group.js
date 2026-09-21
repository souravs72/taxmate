// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE VAT Group", {
	setup(frm) {
		frm.set_query("representative_company", () => ({
			filters: { country: "United Arab Emirates" },
		}));
		frm.set_query("company", "members", () => ({
			filters: { country: "United Arab Emirates" },
		}));
	},
	refresh(frm) {
		if (frm.doc.docstatus === 1) {
			frm.dashboard.set_headline_alert(
				__("Submitted VAT group election. EmaraTax still files the group return."),
				"green"
			);
		} else if (frm.doc.docstatus === 0) {
			frm.dashboard.set_headline_alert(
				__(
					"Draft election. Submit to lock membership before filing a group VAT 201. This does not register the group with the FTA."
				),
				"orange"
			);
		}
	},
});
