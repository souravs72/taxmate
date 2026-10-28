"""Frozen Scan contract tests (no site OCR).

Callers: ``python -m unittest taxmate.tests.test_idp_scan``.
Covers save(scan_id) without re-extract. User: "Implement the plan as specified…"
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch


class TestSaveRequiresScanId(unittest.TestCase):
	def test_save_create_rejects_missing_scan_id(self):
		import taxmate.api.idp_desk as desk

		planned = {"ok": True, "doctype": "Purchase Invoice", "route": "/taxmate/purchase-invoices"}
		with patch.object(desk, "_plan", return_value=planned):
			with patch.object(desk, "require_login"):
				out = desk.save(
					action="create",
					target_doctype="Purchase Invoice",
					file_url="/private/files/x.png",
					scan_id=None,
				)
		self.assertFalse(out.get("ok"))
		self.assertEqual(out.get("error_key"), "idp.missing")


class TestFrozenExtractUsedOnSave(unittest.TestCase):
	def test_save_create_does_not_call_read(self):
		import taxmate.api.idp_desk as desk
		from taxmate.idp import scan as scan_mod

		frozen = {
			"success": True,
			"ocr_language": "en",
			"extracted_data": {
				"doctype": "Purchase Invoice",
				"header": {"bill_no": "INV-1", "grand_total": 100},
				"items": [],
			},
			"validation": {"is_valid": True, "errors": [], "warnings": [], "missing_masters": []},
		}
		scan_doc = MagicMock()
		scan_doc.status = scan_mod.READY
		scan_doc.cancel_requested = 0
		scan_doc.file_url = "/private/files/x.png"
		scan_doc.extraction_data = frozen
		scan_doc.created_document = None
		scan_doc.created_doctype = None

		planned = {
			"ok": True,
			"doctype": "Purchase Invoice",
			"route": "/taxmate/purchase-invoices",
			"save_key": "idp.saveDraft",
		}

		with (
			patch.object(desk, "require_login"),
			patch.object(desk, "_plan", return_value=planned),
			patch.object(scan_mod, "assert_scan_access", return_value=scan_doc),
			patch.object(scan_mod, "frozen_extracted", return_value=frozen),
			patch.object(desk, "_read") as read_mock,
			patch("taxmate.idp.masters.split_missing", return_value=([], [])),
			patch("taxmate.idp.masters.release_currency_company"),
			patch("taxmate.idp.masters.release_address_links"),
			patch("taxmate.idp.masters.build_proposals", return_value=[]),
			patch("taxmate.idp.masters.proposals_complete", return_value=True),
			patch("taxmate.idp.masters.merge_proposal_values", return_value=[]),
			patch.object(
				desk,
				"draft_instructions",
				return_value={
					"ok": True,
					"doctype": "Purchase Invoice",
					"header": {"bill_no": "INV-1"},
					"items": [],
				},
			),
			patch.object(desk, "finish_draft", return_value=({"bill_no": "INV-1"}, [])),
			patch.object(desk, "_draft_defaults", return_value={}),
			patch.object(desk, "_fills", return_value={}),
			patch.object(desk, "_proposals", return_value=[]),
			patch.object(desk, "_coerce_proposal_defaults", return_value=[]),
			patch.object(desk, "_context", return_value=MagicMock()),
			patch("idp.tools.create_document.create_document") as create_mock,
			patch.object(scan_mod, "mark_scan"),
		):
			create_mock.return_value = MagicMock(
				success=True, data={"name": "PINV-1", "docstatus": 0}
			)
			out = desk._save_create(
				planned,
				"/private/files/x.png",
				fills="{}",
				submit="",
				proposals="[]",
				scan_id="IDPLOG-TEST",
			)

		read_mock.assert_not_called()
		self.assertTrue(out.get("ok"))
		self.assertEqual(out.get("name"), "PINV-1")
		self.assertEqual(out.get("scan_id"), "IDPLOG-TEST")


class TestPipelineVersion(unittest.TestCase):
	def test_pipeline_version_is_int(self):
		from taxmate.idp.scan import PIPELINE_VERSION

		self.assertIsInstance(PIPELINE_VERSION, int)
		self.assertGreaterEqual(PIPELINE_VERSION, 1)


class TestJsonValueForSetValue(unittest.TestCase):
	"""Regression: raw dict into set_value on JSON columns → MariaDB 1064."""

	def test_dict_is_json_encoded(self):
		import json

		from taxmate.idp.jobs import _json_value

		out = _json_value({"uploaded": 141.1})
		self.assertIsInstance(out, str)
		self.assertEqual(json.loads(out), {"uploaded": 141.1})
		# Python dict repr would use single quotes and break SQL.
		self.assertNotIn("'", out)

	def test_none_and_str(self):
		from taxmate.idp.jobs import _json_value

		self.assertEqual(_json_value(None), "{}")
		self.assertEqual(_json_value('{"a": 1}'), '{"a": 1}')


class TestGetScanFailedDetail(unittest.TestCase):
	def test_failed_includes_error_message_detail(self):
		import taxmate.api.idp_desk as desk
		from taxmate.idp import scan as scan_mod

		doc = MagicMock()
		doc.status = scan_mod.FAILED
		doc.error_key = "idp.readFailed"
		doc.error_message = "(1064, \"syntax error near 'uploaded': 1}\")"
		doc.name = "IDPLOG-FAIL"
		doc.file_url = "/private/files/x.png"
		doc.target_doctype = "Purchase Invoice"

		with (
			patch.object(desk, "require_login"),
			patch("taxmate.idp.scan.assert_scan_access", return_value=doc),
			patch(
				"taxmate.idp.scan.scan_payload",
				return_value={"ok": True, "status": scan_mod.FAILED, "scan_id": "IDPLOG-FAIL"},
			),
		):
			out = desk.get_scan("IDPLOG-FAIL", "Purchase Invoice")

		self.assertFalse(out.get("ok"))
		self.assertEqual(out.get("error_key"), "idp.readFailed")
		self.assertIn("1064", out.get("detail") or "")

	def test_ready_scan_without_a_plan_is_not_left_reading(self):
		import taxmate.api.idp_desk as desk
		from taxmate.idp import scan as scan_mod

		doc = MagicMock()
		doc.status = scan_mod.REVIEW
		doc.error_key = None
		doc.error_message = ""
		doc.name = "IDPLOG-READY"
		doc.file_url = "/private/files/x.pdf"
		doc.target_doctype = "Purchase Invoice"

		with (
			patch.object(desk, "require_login"),
			patch("taxmate.idp.scan.assert_scan_access", return_value=doc),
			patch(
				"taxmate.idp.scan.scan_payload",
				return_value={"ok": True, "status": scan_mod.REVIEW, "scan_id": "IDPLOG-READY"},
			),
			patch.object(desk, "_plan", return_value={"ok": False, "error_key": "idp.denied"}),
		):
			out = desk.get_scan("IDPLOG-READY", "Purchase Invoice")

		self.assertFalse(out.get("ok"))
		self.assertEqual(out.get("error_key"), "idp.denied")
		self.assertNotIn("review", out)


class TestOcrAmountParsing(unittest.TestCase):
	def test_arabic_dirham_suffix(self):
		from taxmate.idp.masters import _money, _parse_ocr_amount

		self.assertEqual(_parse_ocr_amount("15.00 إ.د"), 15.0)
		self.assertEqual(_parse_ocr_amount("15.00 ا.د"), 15.0)
		self.assertEqual(_parse_ocr_amount("15.00."), 15.0)
		self.assertEqual(_parse_ocr_amount("١٥.٠٠"), 15.0)
		self.assertEqual(_parse_ocr_amount("د.إ 1,194.37"), 1194.37)
		self.assertEqual(_parse_ocr_amount("AED 15.00"), 15.0)
		self.assertEqual(_money("15.00 إ.د"), 15.0)
		self.assertEqual(_parse_ocr_amount("TBD"), None)
		self.assertEqual(_money("TBD"), 0.0)

	def test_arabic_amount_does_not_fail_normalize(self):
		from taxmate.idp.masters import normalize_extract

		extracted = {
			"success": True,
			"extracted_data": {
				"doctype": "Purchase Invoice",
				"header": {"grand_total": "15.00 إ.د", "net_total": "15.00 إ.د"},
				"items": [
					{
						"item_name": "Gold",
						"qty": "1",
						"rate": "15.00 إ.د",
						"amount": "15.00 إ.د",
					}
				],
			},
		}
		normalize_extract(extracted)
		header = extracted["extracted_data"]["header"]
		row = extracted["extracted_data"]["items"][0]
		self.assertEqual(header["grand_total"], 15.0)
		self.assertEqual(row["rate"], 15.0)
		self.assertEqual(row["amount"], 15.0)

	def test_unparseable_header_amount_becomes_zero(self):
		from taxmate.idp.masters import normalize_extract

		extracted = {
			"success": True,
			"extracted_data": {
				"doctype": "Purchase Invoice",
				"header": {"grand_total": "TBD"},
				"items": [{"item_name": "Gold", "qty": "1", "rate": "see invoice"}],
			},
		}
		normalize_extract(extracted)
		header = extracted["extracted_data"]["header"]
		row = extracted["extracted_data"]["items"][0]
		self.assertEqual(header["grand_total"], 0.0)
		self.assertEqual(row["rate"], 0.0)


class TestMarkScanStatus(unittest.TestCase):
	def test_created_goes_review_saving_saved(self):
		from taxmate.idp import scan as scan_mod

		class FakeScan:
			def __init__(self):
				self.status = scan_mod.REVIEW
				self.created_doctype = None
				self.created_document = None
				self.saves = []

			def save(self, ignore_permissions=False):
				self.saves.append((self.status, self.created_document, ignore_permissions))

			def reload(self):
				return None

		doc = FakeScan()
		with patch.object(scan_mod, "assert_scan_access", return_value=doc):
			scan_mod.mark_scan(
				"IDPLOG-1",
				status="Created",
				created_doctype="Purchase Invoice",
				created_document="PINV-1",
			)
		self.assertEqual([s[0] for s in doc.saves], ["Saving", "Saved"])
		self.assertEqual([s[1] for s in doc.saves], ["PINV-1", "PINV-1"])
		self.assertTrue(all(s[2] for s in doc.saves))
		self.assertEqual(doc.created_document, "PINV-1")
		self.assertEqual(doc.status, "Saved")

	def test_created_from_saving_goes_saved(self):
		from taxmate.idp import scan as scan_mod

		class FakeScan:
			def __init__(self):
				self.status = "Saving"
				self.created_doctype = None
				self.created_document = None
				self.saves = []

			def save(self, ignore_permissions=False):
				self.saves.append((self.status, self.created_document, ignore_permissions))

			def reload(self):
				return None

		doc = FakeScan()
		with patch.object(scan_mod, "assert_scan_access", return_value=doc):
			scan_mod.mark_scan(
				"IDPLOG-1",
				status="Created",
				created_doctype="Purchase Invoice",
				created_document="PINV-1",
			)
		self.assertEqual([s[0] for s in doc.saves], ["Saved"])
		self.assertEqual(doc.saves[0][1], "PINV-1")
		self.assertEqual(doc.created_document, "PINV-1")
		self.assertEqual(doc.status, "Saved")

	def test_created_stays_on_saving_if_saved_save_fails(self):
		from taxmate.idp import scan as scan_mod

		class FakeScan:
			def __init__(self):
				self.status = scan_mod.REVIEW
				self.created_doctype = None
				self.created_document = None
				self.saves = []

			def save(self, ignore_permissions=False):
				self.saves.append((self.status, self.created_document, ignore_permissions))
				if self.status == "Saved":
					raise RuntimeError("saved hop failed")

			def reload(self):
				return None

		doc = FakeScan()
		with patch.object(scan_mod, "assert_scan_access", return_value=doc):
			with self.assertRaises(RuntimeError):
				scan_mod.mark_scan(
					"IDPLOG-1",
					status="Created",
					created_doctype="Purchase Invoice",
					created_document="PINV-1",
				)
		self.assertEqual(doc.saves[0][0], "Saving")
		self.assertEqual(doc.saves[0][1], "PINV-1")
		self.assertEqual(doc.created_document, "PINV-1")


class TestSaveCreateLinkedScan(unittest.TestCase):
	def test_saving_with_created_document_does_not_make_a_second_draft(self):
		import taxmate.api.idp_desk as desk
		from taxmate.idp import scan as scan_mod

		scan_doc = MagicMock()
		scan_doc.status = "Saving"
		scan_doc.cancel_requested = 0
		scan_doc.created_document = "PINV-1"
		scan_doc.created_doctype = "Purchase Invoice"
		planned = {
			"ok": True,
			"doctype": "Purchase Invoice",
			"route": "/purchase-invoices",
		}

		with (
			patch.object(scan_mod, "assert_scan_access", return_value=scan_doc),
			patch.object(scan_mod, "mark_scan") as mark,
			patch("idp.tools.create_document.create_document") as create_mock,
		):
			out = desk._save_create(
				planned,
				"/private/files/x.png",
				fills="{}",
				submit="",
				scan_id="IDPLOG-1",
			)

		create_mock.assert_not_called()
		mark.assert_called_once()
		self.assertTrue(out.get("ok"))
		self.assertEqual(out.get("name"), "PINV-1")
		self.assertEqual(out.get("scan_id"), "IDPLOG-1")


if __name__ == "__main__":
	unittest.main()
