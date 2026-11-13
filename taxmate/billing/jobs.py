"""Scheduled billing jobs."""

from __future__ import annotations

import frappe


def sync_expired_subscriptions():
	from taxmate.billing.entitlement import sync_expired_statuses

	updated = sync_expired_statuses()
	if updated:
		frappe.logger("taxmate.billing").info(f"expired subscriptions updated: {updated}")
