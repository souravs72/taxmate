// Copyright (c) 2026, Sourav Singh and contributors
// For license information, please see license.txt

frappe.ui.form.on("UAE UBO Register", {
	refresh(frm) {
		render_alerts(frm);

		if (!frm.is_new()) {
			frm.add_custom_button(__("Log a Change"), () => {
				frappe.prompt(
					[
						{
							fieldname: "change_type",
							label: __("Change Type"),
							fieldtype: "Select",
							options:
								"New UBO Added\nUBO Ceased\nParticulars Updated (name/ID/address)\nOwnership % Changed\nNominee Arrangement Changed\nOther",
							reqd: 1,
						},
						{
							fieldname: "change_date",
							label: __("Change Date"),
							fieldtype: "Date",
							default: frappe.datetime.get_today(),
							reqd: 1,
						},
						{
							fieldname: "description",
							label: __("Description"),
							fieldtype: "Small Text",
						},
					],
					(values) => {
						frappe.call({
							doc: frm.doc,
							method: "log_change",
							args: values,
							freeze: true,
							callback(r) {
								if (!r.exc) {
									frappe.show_alert({
										message: __("Change logged."),
										indicator: "green",
									});
									frm.reload_doc();
								}
							},
						});
					},
					__("Log a UBO Change"),
					__("Log")
				);
			});
		}
	},
});

function render_alerts(frm) {
	if (frm.is_new()) return;

	const messages = [];

	if (!(frm.doc.beneficial_owners || []).length) {
		messages.push({
			text: __(
				"No beneficial owners recorded yet. Add at least one UBO row (or a Senior Management Official fallback)."
			),
			indicator: "orange",
		});
	}

	const unresolved = (frm.doc.beneficial_owners || []).filter(
		(row) => row.person_type === "Legal Entity" && !(row.ultimate_natural_person || "").trim()
	);
	if (unresolved.length) {
		messages.push({
			text: __(
				"Legal-entity UBO rows must name the natural person the control chain resolves to."
			),
			indicator: "orange",
		});
	}

	const unnamed_nominees = (frm.doc.beneficial_owners || []).filter(
		(row) => row.is_nominee && !(row.nominee_for || "").trim()
	);
	if (unnamed_nominees.length) {
		messages.push({
			text: __("Nominee UBO rows must name who they hold for."),
			indicator: "orange",
		});
	}

	const today = frappe.datetime.get_today();
	const expired = (frm.doc.beneficial_owners || []).filter(
		(row) =>
			row.is_active &&
			row.identification_expiry_date &&
			row.identification_expiry_date < today
	);
	if (expired.length) {
		messages.push({
			text: __("{0} active UBO(s) have an expired ID on file — re-verify: {1}", [
				expired.length,
				expired.map((row) => row.full_name).join(", "),
			]),
			indicator: "orange",
		});
	}

	if (frm.doc.status === "Overdue") {
		messages.push({
			text: __(
				"A UBO change was not reported within the deadline. Report it to your licensing authority and log the date above."
			),
			indicator: "red",
		});
	} else if (frm.doc.status === "Update Reporting Due") {
		messages.push({
			text: __(
				"A logged UBO change is still within its reporting window — report it to your licensing authority soon."
			),
			indicator: "orange",
		});
	}

	messages.forEach((m) => frm.dashboard.add_comment(m.text, m.indicator, true));
}
