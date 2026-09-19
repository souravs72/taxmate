// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.listview_settings["UAE E-Invoice Log"] = {
	get_indicator(doc) {
		const colors = {
			Accepted: "green",
			Submitted: "blue",
			Generated: "orange",
			Queued: "orange",
			Failed: "red",
			Rejected: "red",
			Cancelled: "gray",
			Draft: "gray",
		};
		return [__(doc.status), colors[doc.status] || "gray", `status,=,${doc.status}`];
	},
};
