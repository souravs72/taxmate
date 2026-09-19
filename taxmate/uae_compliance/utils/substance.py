"""ESR economic-substance evidence — not just 'activity ticked'."""

from __future__ import annotations


def activity_substance_complete(
	employee_count,
	operating_expenditure_aed,
	substance_evidence: str | None,
	board_meetings_in_uae=None,
) -> bool:
	"""A relevant activity is evidenced when directed-and-managed, headcount, spend, and a note are recorded.

	Zero employees, spend, or UAE board meetings is allowed (e.g. a holding company) — blank is not.
	"""
	if employee_count is None or operating_expenditure_aed is None or board_meetings_in_uae is None:
		return False
	return bool((substance_evidence or "").strip())


def board_minutes_attached(board_minutes: str | None) -> bool:
	return bool((board_minutes or "").strip())
