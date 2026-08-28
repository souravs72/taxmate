"""Sandbox ASP — local echo without network calls."""

from __future__ import annotations

from typing import Any

import frappe

from taxmate.uae_e_invoicing.api_classes.base import BaseAPI


class SandboxAPI(BaseAPI):
	API_NAME = "UAE E-Invoice Sandbox"

	def setup(self):
		pass

	def submit_invoice(self, payload: dict[str, Any]) -> dict[str, Any]:
		"""Accept payload locally and log an Integration Request without HTTP."""
		integration = frappe.get_doc(
			{
				"doctype": "Integration Request",
				"integration_request_service": self.API_NAME,
				"status": "Completed",
				"url": "sandbox://local",
				"data": frappe.as_json(payload),
				"output": frappe.as_json(
					{
						"status": "Accepted",
						"uuid": payload.get("UUID"),
						"message": "Sandbox accept — no remote submission",
					}
				),
			}
		)
		integration.insert(ignore_permissions=True)
		return {
			"mode": "sandbox",
			"status": "Accepted",
			"document_id": payload.get("UUID"),
			"uuid": payload.get("UUID"),
			"raw": {"integration_request": integration.name},
		}

	def get_document_status(self, document_id: str) -> dict[str, Any]:
		return {"status": "Accepted", "document_id": document_id}

	def lookup_participant(self, peppol_id: str) -> dict[str, Any]:
		return {"mode": "sandbox", "peppol_id": peppol_id, "registered": True}

	def get_document_xml(self, document_id: str) -> bytes:
		return b"<Invoice><!-- sandbox: signed XML is returned by a real ASP --></Invoice>"

	def get_document_pdf(self, document_id: str) -> bytes:
		return b"%PDF-1.4\n%sandbox placeholder\n%%EOF"
