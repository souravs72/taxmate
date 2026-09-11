// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

/* global taxmate */

frappe.ui.form.on("Company", {
	refresh(frm) {
		taxmate.show_uae_readiness(frm);
		if (!frm.is_new() && frm.doc.country === "United Arab Emirates") {
			frm.add_custom_button(
				__("Verify Peppol ID"),
				() => {
					if (!frm.doc.uae_peppol_id) {
						frappe.msgprint({
							title: __("Peppol Participant ID"),
							indicator: "orange",
							message: __("Set Peppol Participant ID on the company first."),
						});
						return;
					}
					frappe.call({
						method: "taxmate.uae_e_invoicing.utils.participant.lookup_peppol_participant",
						args: { peppol_id: frm.doc.uae_peppol_id },
						freeze: true,
						freeze_message: __("Looking up the Peppol directory..."),
						callback(r) {
							if (!r.message) return;
							frappe.msgprint({
								title: __("Peppol Directory"),
								indicator: r.message.registered !== false ? "green" : "red",
								message: `<pre>${frappe.utils.escape_html(
									JSON.stringify(r.message, null, 2)
								)}</pre>`,
							});
						},
					});
				},
				__("UAE E-Invoice")
			);
		}
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
						<a href="/desk/taxmate-settings">${__("TaxMate Settings")}</a>
						&nbsp;|&nbsp;
						<a href="/desk/uae-vat-settings">${__("UAE VAT Settings")}</a>
						&nbsp;|&nbsp;
						<a href="/desk/query-report/UAE%20VAT%20201">${__("UAE VAT 201")}</a>
					</div>
				</div>`,
				color
			);
		},
	});
};
