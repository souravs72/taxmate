"""Context for the TaxMate SPA page.

Injects the CSRF token and the site name into the rendered HTML.

Why not the `<!-- csrf_token -->` comment: Frappe replaces that with
`frappe.csrf_token` (frappe/website/page_renderers/base_template_page.py:18-22),
but frappe-js-sdk reads `window.csrf_token`
(frappe-js-sdk/lib/utils/axios.js:25). Setting it here covers both and also
gives us the site name from the server, so nothing is hardcoded in the bundle.
"""

import frappe
from frappe import _

from taxmate.api.permission import has_app_permission


def get_context(context):
	if frappe.session.user == "Guest":
		path = frappe.request.path if frappe.request else "/taxmate"
		query = frappe.request.query_string.decode() if frappe.request and frappe.request.query_string else ""
		target = path + (f"?{query}" if query else "")
		frappe.local.flags.redirect_location = f"/login?redirect-to={target}"
		raise frappe.Redirect

	if not has_app_permission():
		frappe.throw(_("You do not have permission to access TaxMate"), frappe.PermissionError)

	context.no_cache = 1
	context.csrf_token = frappe.sessions.get_csrf_token()
	# Persist the generated token; without a commit the next POST sees a mismatch.
	frappe.db.commit()
	context.site_name = frappe.local.site
	context.frappe_user = frappe.session.user
	context.socket_port = frappe.conf.socketio_port or ""
	return context
