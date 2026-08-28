// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("TaxMate Settings", {
	refresh(frm) {
		frm.set_intro(
			__(
				"TaxMate orchestrates ERPNext UAE VAT localization. Configure enforcement flags here; regional fields and the UAE VAT 201 report remain in ERPNext."
			)
		);
	},
});
