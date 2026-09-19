"""Context for the TaxMate SPA page.

Injects the CSRF token and the site name into the rendered HTML.

Why not the `<!-- csrf_token -->` comment: Frappe replaces that with
`frappe.csrf_token` (frappe/website/page_renderers/base_template_page.py:18-22),
but frappe-js-sdk reads `window.csrf_token`
(frappe-js-sdk/lib/utils/axios.js:25). Setting it here covers both and also
gives us the site name from the server, so nothing is hardcoded in the bundle.
"""

import frappe


def get_context(context):
    context.no_cache = 1
    context.csrf_token = frappe.sessions.get_csrf_token()
    context.site_name = frappe.local.site
    context.frappe_user = frappe.session.user
    context.socket_port = frappe.conf.socketio_port or ""
    return context
