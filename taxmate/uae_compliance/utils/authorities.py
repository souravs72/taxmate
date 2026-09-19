"""Licence-authority deadline overrides (DED, ADGM, DIFC, RAKEZ, …)."""

from __future__ import annotations

from taxmate.uae_compliance.constants import (
	DEFAULT_ESR_NOTIFICATION_DEADLINE_MONTHS,
	DEFAULT_ESR_REPORT_DEADLINE_MONTHS,
	DEFAULT_UBO_CHANGE_REPORT_DEADLINE_DAYS,
)


def resolve_authority_deadlines(
	authority: str | None,
	rules: list[dict] | None,
	defaults: dict | None = None,
) -> dict[str, int]:
	"""Return UBO/ESR windows for an authority, falling back to settings defaults."""
	base = {
		"ubo_change_report_deadline_days": DEFAULT_UBO_CHANGE_REPORT_DEADLINE_DAYS,
		"esr_notification_deadline_months": DEFAULT_ESR_NOTIFICATION_DEADLINE_MONTHS,
		"esr_report_deadline_months": DEFAULT_ESR_REPORT_DEADLINE_MONTHS,
	}
	if defaults:
		for key, value in defaults.items():
			if value is not None:
				base[key] = int(value)
	if not authority:
		return base
	for row in rules or []:
		if (row.get("authority") or "") == authority:
			out = dict(base)
			for key in base:
				raw = row.get(key)
				if raw in (None, ""):
					continue
				value = int(raw)
				if value > 0:
					out[key] = value
			return out
	return base
