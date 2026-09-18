app_name = "taxmate"
app_title = "TaxMate"
app_publisher = "Sourav Singh"
app_description = "A cloud accounting SaaS platform for businesses to manage bookkeeping, taxation, and financial reporting."
app_email = "sourav@ascratech.com"
app_license = "mit"

# Apps
# ------------------

required_apps = ["erpnext"]

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "taxmate",
# 		"logo": "/assets/taxmate/logo.png",
# 		"title": "TaxMate",
# 		"route": "/taxmate",
# 		"has_permission": "taxmate.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/taxmate/css/taxmate.css"
app_include_js = [
	"/assets/taxmate/js/taxmate_e_invoice.js",
	"/assets/taxmate/js/taxmate_search.js",
]

# include js, css files in header of web template
# web_include_css = "/assets/taxmate/css/taxmate.css"
# web_include_js = "/assets/taxmate/js/taxmate.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "taxmate/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Company": "public/js/company.js",
	"Customer": "public/js/party.js",
	"Supplier": "public/js/party.js",
	"Sales Invoice": "public/js/sales_invoice.js",
	"Purchase Invoice": "public/js/purchase_invoice.js",
}
doctype_list_js = {
	"Sales Invoice": "public/js/sales_invoice_list.js",
	"Purchase Invoice": "public/js/purchase_invoice_list.js",
}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "taxmate/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "taxmate.utils.jinja_methods",
# 	"filters": "taxmate.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "taxmate.install.before_install"
after_install = "taxmate.install.after_install"
after_migrate = "taxmate.install.after_migrate"

# Uninstallation
# ------------

# before_uninstall = "taxmate.uninstall.before_uninstall"
# after_uninstall = "taxmate.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "taxmate.utils.before_app_install"
# after_app_install = "taxmate.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "taxmate.utils.before_app_uninstall"
# after_app_uninstall = "taxmate.utils.after_app_uninstall"

# Build
# ------------------
# To hook into the build process

# after_build = "taxmate.build.after_build"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "taxmate.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"Company": {
		"validate": "taxmate.uae.company.validate",
		"after_insert": [
			"taxmate.uae.company.after_insert",
			"taxmate.uae_compliance.company.after_insert",
			"taxmate.uae_corporate_tax.company.after_insert",
		],
		"on_update": "taxmate.uae.company.on_update",
	},
	"Customer": {
		"validate": "taxmate.uae.validation.validate_party_trn",
	},
	"Supplier": {
		"validate": "taxmate.uae.validation.validate_party_trn",
	},
	"Address": {
		"validate": "taxmate.uae.validation.validate_address_emirate",
	},
	"Item": {
		"validate": "taxmate.uae_vat.overrides.item.validate",
	},
	"Sales Invoice": {
		"validate": [
			"taxmate.uae_vat.overrides.sales_invoice.validate",
			"taxmate.uae_e_invoicing.overrides.sales_invoice.validate",
			"taxmate.uae_corporate_tax.overrides.sales_invoice.validate",
		],
		"before_submit": "taxmate.uae_e_invoicing.overrides.sales_invoice.before_submit",
		"on_submit": "taxmate.uae_e_invoicing.overrides.sales_invoice.on_submit",
		"before_cancel": [
			"taxmate.uae_vat.overrides.sales_invoice.before_cancel",
			"taxmate.uae_e_invoicing.overrides.sales_invoice.before_cancel",
		],
		"on_cancel": "taxmate.uae_e_invoicing.overrides.sales_invoice.on_cancel",
	},
	"Purchase Invoice": {
		"validate": [
			"taxmate.uae_vat.overrides.purchase_invoice.validate",
			"taxmate.uae_corporate_tax.overrides.purchase_invoice.validate",
		],
		"before_submit": "taxmate.uae_e_invoicing.overrides.purchase_invoice.before_submit",
		"on_submit": "taxmate.uae_e_invoicing.overrides.purchase_invoice.on_submit",
		"before_cancel": [
			"taxmate.uae_vat.overrides.purchase_invoice.before_cancel",
			"taxmate.uae_e_invoicing.overrides.purchase_invoice.before_cancel",
		],
		"on_cancel": "taxmate.uae_e_invoicing.overrides.purchase_invoice.on_cancel",
	},
}

for _retained in (
	"UAE VAT 201 Filing Log",
	"UAE CT Filing Log",
	"UAE ESR Filing",
	"UAE Excise Filing Log",
	"UAE Customs Declaration",
	"UAE Bad Debt Relief",
	"UAE Capital Goods Adjustment",
	"UAE VAT Group",
	"UAE FTA Audit Pack",
):
	doc_events.setdefault(_retained, {})
	doc_events[_retained]["on_trash"] = "taxmate.uae.retention.on_trash"

# Scheduled Tasks
# ---------------

scheduler_events = {
	"hourly": [
		"taxmate.uae_e_invoicing.background_jobs.retry.retry_failed_e_invoices",
		"taxmate.uae_e_invoicing.background_jobs.status_poll.poll_submitted_e_invoices",
	],
	"daily": [
		"taxmate.uae_compliance.notifications.refresh_all_statuses",
		"taxmate.uae_compliance.notifications.send_deadline_reminders",
		"taxmate.uae_vat.notifications.send_vat_201_reminders",
		"taxmate.uae_e_invoicing.notifications.send_e_invoice_reminders",
		"taxmate.uae_corporate_tax.notifications.send_ct_reminders",
		"taxmate.uae_vat.utils.late_filing.sync_late_filing_notices",
	],
}

# Testing
# -------

# before_tests = "taxmate.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "taxmate.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
override_whitelisted_methods = {
	"idp.api.settings.get_settings": "taxmate.idp.clerk.get_settings",
	"idp.api.conversation.confirm_card": "taxmate.idp.clerk.confirm_card",
}

# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "taxmate.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["taxmate.utils.before_request"]
# after_request = ["taxmate.utils.after_request"]

# Job Events
# ----------
# before_job = ["taxmate.utils.before_job"]
# after_job = ["taxmate.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"taxmate.auth.validate"
# ]

extend_bootinfo = "taxmate.search.boot_session"

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []
