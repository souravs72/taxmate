# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

from frappe.model.document import Document
from frappe.utils import now_datetime


class TaxMateMobileDevice(Document):
	"""One signed-in TaxMate mobile app install. Tokens live only on the device.

	Rows are created by ``taxmate.api.mobile`` (never from Desk). Ticking
	*Revoked* in Desk signs the device out on its next request.
	"""

	def validate(self) -> None:
		if self.revoked and not self.revoked_on:
			self.revoked_on = now_datetime()

	def on_update(self) -> None:
		if self.revoked and self.token_hash:
			from taxmate.api.mobile_auth import forget_token_hash

			forget_token_hash(self.token_hash)

	def on_trash(self) -> None:
		if self.token_hash:
			from taxmate.api.mobile_auth import forget_token_hash

			forget_token_hash(self.token_hash)
