// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

/* global taxmate */

frappe.ui.form.on("Company", {
	refresh(frm) {
		taxmate.show_uae_readiness(frm);
	},
	country(frm) {
		taxmate.show_uae_readiness(frm);
	},
});

frappe.provide("taxmate");

taxmate.show_uae_readiness = function (frm) {
	if (!frm.doc.name || frm.doc.country !== "United Arab Emirates") {
		frm.dashboard.clear_headline();
		return;
	}

	frappe.call({
		method: "taxmate.uae.readiness.get_uae_readiness_checklist",
		args: { company: frm.doc.name },
		callback(r) {
			if (!r.message || !r.message.applicable) {
				return;
			}

			const data = r.message;
			const lines = (data.items || []).map((item) => {
				const mark = item.ok ? "✓" : "○";
				return `${mark} ${item.label}`;
			});

			const color = data.ready ? "green" : "orange";
			frm.dashboard.set_headline_alert(
				`<div>
					<strong>${frappe.utils.escape_html(data.message)}</strong>
					<div class="text-muted" style="margin-top: 4px;">${lines
						.map((l) => frappe.utils.escape_html(l))
						.join("<br>")}</div>
					<div style="margin-top: 6px;">
						<a href="/app/taxmate-settings">${__("TaxMate Settings")}</a>
						&nbsp;|&nbsp;
						<a href="/app/uae-vat-settings">${__("UAE VAT Settings")}</a>
						&nbsp;|&nbsp;
						<a href="/app/query-report/UAE%20VAT%20201">${__("UAE VAT 201")}</a>
					</div>
				</div>`,
				color
			);
		},
	});
};
