# Copyright (c) 2026, Sourav Singh and contributors
# For license information, please see license.txt

"""Stub placeholder for EmaraTax / FTA export formats."""

from __future__ import annotations

from frappe import _


def execute(filters=None):
	columns = [
		{"label": _("Note"), "fieldname": "note", "fieldtype": "Data", "width": 500},
	]
	data = [
		{"note": _("EmaraTax export is not implemented yet. Use UAE VAT 201 and e-invoice logs for now.")}
	]
	return columns, data
