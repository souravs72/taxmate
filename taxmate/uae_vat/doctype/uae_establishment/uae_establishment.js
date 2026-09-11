// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE Establishment", {
	setup(frm) {
		frm.set_query("company", () => ({
			filters: { country: "United Arab Emirates" },
		}));
		frm.set_query("cost_center", () => ({
			filters: { company: frm.doc.company, is_group: 0 },
		}));
	},
});
