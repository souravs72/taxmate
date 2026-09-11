"""UAE UBO / ESR constants used by the compliance tracker.

References:
- Cabinet Decision No. 109 of 2023 (Real Beneficiary / UBO procedures)
- Cabinet Decision No. 58 of 2020 as amended (UBO regulations)
- Cabinet Decision No. 57 of 2020 and No. 98 of 2024 (Economic Substance Regulations)
"""

from __future__ import annotations

# Cabinet Decision 109/2023: a beneficial owner is a natural person who
# either owns/controls 25%+ of shares or voting rights, or otherwise
# exercises control (e.g. right to appoint/dismiss the majority of
# directors). When no individual meets either test, the senior management
# official responsible for the entity is the fallback UBO of record.
UBO_CONTROL_BASIS_OPTIONS = (
	"Ownership of 25% or more of share capital",
	"Holds 25% or more of voting rights",
	"Right to appoint or dismiss majority of directors/managers",
	"Otherwise exercises significant control or influence",
	"Senior Management Official (fallback — no individual meets the above)",
)

UBO_ID_TYPE_OPTIONS = ("Passport", "Emirates ID", "National ID (Other)")

# A change to the UBO register (new UBO, ceased UBO, changed particulars)
# must be reported to the relevant licensing authority within this many
# calendar days (Cabinet Decision 109/2023, Article 8). Kept as a constant
# default; the live value used by the app is the configurable
# UAE Compliance Settings.ubo_change_report_deadline_days field.
DEFAULT_UBO_CHANGE_REPORT_DEADLINE_DAYS = 15

# The 9 "Relevant Activities" under the UAE Economic Substance Regulations
# (Cabinet Decision 57/2020 Annex, as amended by Cabinet Decision 98/2024).
ESR_RELEVANT_ACTIVITIES = (
	"Banking Business",
	"Insurance Business",
	"Investment Fund Management Business",
	"Lease-Finance Business",
	"Headquarters Business",
	"Shipping Business",
	"Holding Company Business",
	"Intellectual Property Business",
	"Distribution and Service Centre Business",
)

ESR_EXEMPTION_REASONS = (
	"Not Applicable — No Relevant Activity Conducted",
	"Tax Resident Outside the UAE",
	"Investment Fund",
	"Entity Fully Owned by UAE Residents, With No Part of a MNE Group, and Business Only in the UAE",
	"Branch of a Foreign Entity Whose Relevant Income Is Taxed Outside the UAE",
	"UAE Government / Government-Owned Entity",
	"Other (see Notes)",
)

# Historically the ESR regime required two separate deadlines: an annual
# NOTIFICATION within 6 months of financial year end, and the full ESR
# REPORT (for entities not exempt) within 12 months of financial year end.
# The UAE government's own current guidance describes a combined "annual
# notification form and Economic Substance Report ... within 12 months",
# and some regulatory authorities may since have aligned both filings to
# one deadline (post Cabinet Decision 98/2024). Both figures below are
# defaults only — confirm the live deadline with your specific regulatory
# authority (DMCC, JAFZA, ADGM, DIFC, Ministry of Economy, etc.) and
# override them per record if they differ; do not trust these blindly.
DEFAULT_ESR_NOTIFICATION_DEADLINE_MONTHS = 6
DEFAULT_ESR_REPORT_DEADLINE_MONTHS = 12

UBO_STATUS_COMPLIANT = "Compliant"
UBO_STATUS_UPDATE_DUE = "Update Reporting Due"
UBO_STATUS_OVERDUE = "Overdue"

ESR_STATUS_NOT_STARTED = "Not Started"
ESR_STATUS_NOTIFICATION_DUE = "Notification Due"
ESR_STATUS_NOTIFICATION_FILED = "Notification Filed"
ESR_STATUS_REPORT_DUE = "Report Due"
ESR_STATUS_COMPLETE = "Complete"
ESR_STATUS_OVERDUE = "Overdue"
