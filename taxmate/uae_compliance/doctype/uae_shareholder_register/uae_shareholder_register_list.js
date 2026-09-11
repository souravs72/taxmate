// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.listview_settings["UAE Shareholder Register"] = {
	get_indicator(doc) {
		if (doc.status === "On File") {
			return [__("On File"), "green", "status,=,On File"];
		}
		return [__("Empty"), "orange", "status,=,Empty"];
	},
};
