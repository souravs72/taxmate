// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("TaxMate Settings", {
	refresh(frm) {
		frm.set_intro(
			__(
				"Configure TaxMate UAE localization enforcement here. Regional VAT fields, tax templates, and the UAE VAT 201 report live under UAE Compliance."
			)
		);
	},
});
