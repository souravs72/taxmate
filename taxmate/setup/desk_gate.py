"""Keep Frappe Desk on the Administrator account.

Website users already land on /taxmate. System Manager accounts can still
open /desk unless the request is stopped here, before Frappe rewrites
/app and /apps onto /desk.
"""

from __future__ import annotations

from werkzeug.exceptions import HTTPException
from werkzeug.utils import redirect

_DESK_ROOTS = ("/desk", "/app", "/apps")


def is_desk_route(path: str) -> bool:
	"""True for /desk, /app, /apps and their children. Not /api or /taxmate."""
	clean = (path or "").split("?", 1)[0]
	if not clean.startswith("/"):
		clean = "/" + clean
	if len(clean) > 1:
		clean = clean.rstrip("/")
	return any(clean == root or clean.startswith(root + "/") for root in _DESK_ROOTS)


def desk_redirect_for(user: str | None, path: str) -> str | None:
	"""Where a non-Administrator goes. None means the request may continue."""
	if not is_desk_route(path):
		return None
	if user == "Administrator":
		return None
	if not user or user == "Guest":
		return "/login?redirect-to=/taxmate"
	return "/taxmate"


def block_desk_for_non_admin() -> None:
	import frappe

	request = getattr(frappe, "request", None)
	if request is None:
		return
	target = desk_redirect_for(getattr(frappe.session, "user", None), getattr(request, "path", "") or "")
	if target:
		raise _Found(target)


class _Found(HTTPException):
	code = 302

	def __init__(self, location: str) -> None:
		super().__init__(description=location)
		self.location = location

	def get_response(self, environ=None, scope=None):
		return redirect(self.location, code=302)
