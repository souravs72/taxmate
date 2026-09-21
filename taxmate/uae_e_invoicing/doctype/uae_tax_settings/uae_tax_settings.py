# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from __future__ import annotations

from urllib.parse import urlparse

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint


class UAETaxSettings(Document):
	def validate(self):
		if self.sla_days is not None and cint(self.sla_days) < 1:
			frappe.throw(_("Transmission SLA Days must be at least 1."))
		if self.archive_retention_years is not None and cint(self.archive_retention_years) < 5:
			frappe.throw(_("Archive Retention must be at least 5 years (FTA minimum)."))
		self._validate_base_url()

	def _validate_base_url(self):
		if not self.base_url:
			return
		parsed = urlparse(self.base_url)
		host = (parsed.hostname or "").lower()
		if parsed.scheme != "https":
			frappe.throw(_("ASP Base URL must use HTTPS."))
		if not host or host in ("localhost", "127.0.0.1", "::1") or host.endswith(".local"):
			frappe.throw(_("ASP Base URL cannot point at a local host."))
		if parsed.username or parsed.password:
			frappe.throw(_("ASP Base URL must not include credentials."))
