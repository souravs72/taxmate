// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE Tax Settings", {
	refresh(frm) {
		if (frm.doc.sandbox_mode) {
			frm.dashboard.set_headline_alert(
				__("Sandbox mode: e-invoices are generated locally and not sent to the FTA."),
				"orange"
			);
		}

		frm.add_custom_button(
			__("Register Webhook"),
			() => {
				frappe.call({
					method: "taxmate.uae_e_invoicing.utils.webhook.register_webhook",
					freeze: true,
					freeze_message: __("Registering webhook with the ASP..."),
					callback(r) {
						if (!r.exc && r.message) {
							frappe.msgprint(
								__("Webhook registered. Subscription ID: {0}", [
									r.message.subscription_id || __("(not returned)"),
								])
							);
							frm.reload_doc();
						}
					},
				});
			},
			__("ASP")
		);

		frm.add_custom_button(
			__("Fetch Participant"),
			() => {
				frappe.call({
					method: "taxmate.uae_e_invoicing.utils.participant.fetch_participant_details",
					freeze: true,
					freeze_message: __("Fetching participant profile..."),
					callback(r) {
						if (!r.exc) {
							frappe.show_alert({
								message: __("Participant details updated."),
								indicator: "green",
							});
							frm.reload_doc();
						}
					},
				});
			},
			__("ASP")
		);

		frm.add_custom_button(
			__("Push Participant Profile"),
			() => {
				frappe.prompt(
					[
						{
							fieldname: "company",
							label: __("Company"),
							fieldtype: "Link",
							options: "Company",
							reqd: 1,
							default: frappe.defaults.get_user_default("Company"),
						},
					],
					(values) => {
						frappe.call({
							method: "taxmate.uae_e_invoicing.utils.participant.update_participant_profile",
							args: { company: values.company },
							freeze: true,
							freeze_message: __("Pushing participant profile to the ASP..."),
							callback(r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("Participant profile pushed."),
										indicator: "green",
									});
									frm.reload_doc();
								}
							},
						});
					},
					__("Push Participant Profile"),
					__("Push")
				);
			},
			__("ASP")
		);
	},
});
